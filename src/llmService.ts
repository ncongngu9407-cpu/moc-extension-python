import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';

let chatSession: any = null;
let isInitializing = false;

const outputChannel = vscode.window.createOutputChannel("Phân Tích Mã Nguồn");

function downloadModel(modelUrl: string, destPath: string) {
    return Promise.resolve(vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: "Đang tải mô hình ngôn ngữ (Qwen 2.5 Coder)",
        cancellable: false
    }, (progress) => {
        return new Promise<void>((resolve, reject) => {
            outputChannel.show(true);
            outputChannel.appendLine("Đang kết nối để tải mô hình...");

            const file = fs.createWriteStream(destPath);

            https.get(modelUrl, (response) => {
                const handleStream = (res: any) => {
                    const totalSize = parseInt(res.headers['content-length'] || '0', 10);
                    let downloadedSize = 0;
                    let lastReportedPercent = -1;

                    res.on('data', (chunk: any) => {
                        downloadedSize += chunk.length;
                        if (totalSize > 0) {
                            const percent = Math.floor((downloadedSize / totalSize) * 100);
                            if (percent >= lastReportedPercent + 2) {
                                const increment = percent - Math.max(0, lastReportedPercent);
                                progress.report({ increment: increment, message: `${percent}%` });

                                if (percent % 10 === 0 || percent === 100) {
                                    const downloadedMB = (downloadedSize / 1024 / 1024).toFixed(1);
                                    const totalMB = (totalSize / 1024 / 1024).toFixed(1);
                                    outputChannel.appendLine(`Tiến trình tải: ${percent}% (${downloadedMB} MB / ${totalMB} MB)`);
                                }
                                lastReportedPercent = percent;
                            }
                        }
                    });

                    res.pipe(file);

                    file.on('finish', () => {
                        outputChannel.appendLine("Lưu mô hình hoàn tất.");
                        resolve();
                    });
                };

                if (response.statusCode === 302 || response.statusCode === 301) {
                    const redirectUrl = response.headers.location;
                    if (!redirectUrl) return reject(new Error("Lỗi chuyển hướng URL."));
                    https.get(redirectUrl, handleStream).on('error', reject);
                } else if (response.statusCode === 200) {
                    handleStream(response);
                } else {
                    reject(new Error(`Mã lỗi HTTP: ${response.statusCode}`));
                }
            }).on('error', (err) => {
                fs.unlink(destPath, () => reject(err));
            });
        });
    }));
}

export async function initLLM(globalStoragePath: string) {
    if (chatSession || isInitializing) return;

    isInitializing = true;
    outputChannel.show(true);
    outputChannel.appendLine("Đang khởi tạo hệ thống...");

    try {
        if (!fs.existsSync(globalStoragePath)) {
            fs.mkdirSync(globalStoragePath, { recursive: true });
        }

        const modelName = "Qwen2.5-Coder-7B-Instruct-Q4_K_S.gguf";
        const modelPath = path.join(globalStoragePath, modelName);
        const modelUrl = `https://huggingface.co/bartowski/Qwen2.5-Coder-7B-Instruct-GGUF/resolve/main/${modelName}`;

        if (!fs.existsSync(modelPath)) {
            outputChannel.appendLine("Đang bắt đầu tải cục bộ...");
            await downloadModel(modelUrl, modelPath);
        }

        outputChannel.appendLine("Đang nạp mô hình vào bộ nhớ...");
        
        const { getLlama, LlamaChatSession } = await import("node-llama-cpp");
        const llama = await getLlama();
        const model = await llama.loadModel({ modelPath: modelPath });
        
        // Giới hạn KV Cache để chống tràn VRAM
        const context = await model.createContext({
            contextSize: 2048
        });
        
        chatSession = new LlamaChatSession({
            contextSequence: context.getSequence(),
            systemPrompt: "Bạn là trợ lý lập trình chuyên nghiệp. Trả lời bằng tiếng Việt, súc tích và chuẩn xác."
        });

        outputChannel.appendLine("Nạp mô hình thành công. Hệ thống sẵn sàng.");
        vscode.window.showInformationMessage("Khởi tạo mô hình thành công.");

    } catch (error: any) {
        outputChannel.appendLine(`Lỗi khởi tạo: ${error.message || error}`);
    } finally {
        isInitializing = false;
    }
}

export async function runNodeLlamaCpp(prompt: string): Promise<string> {
    if (!chatSession) return "Hệ thống đang khởi động, vui lòng thử lại sau.";
    
    try {
        const response = await chatSession.prompt(prompt);
        return response.trim();
    } catch (error) {
        return "Lỗi trong quá trình phân tích mã nguồn.";
    }
}