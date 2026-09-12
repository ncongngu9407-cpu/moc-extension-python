import * as vscode from 'vscode';
import { initLLM, runNodeLlamaCpp } from './llmService';

export function activate(context: vscode.ExtensionContext) {
    initLLM(context.globalStorageUri.fsPath);

    const hoverProvider = vscode.languages.registerHoverProvider('python', {
        async provideHover(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken) {
            const currentLineNum = position.line;
            const currentLineText = document.lineAt(currentLineNum).text;
            const startLine = Math.max(0, currentLineNum - 5);
            const contextRange = new vscode.Range(new vscode.Position(startLine, 0), new vscode.Position(currentLineNum, currentLineText.length));
            const codeSnippet = document.getText(contextRange);

            const diagnostics = vscode.languages.getDiagnostics(document.uri);
            const activeDiag = diagnostics.find(d => d.range.contains(position));
            let errorContext = activeDiag ? `Lỗi biên dịch tại vị trí này: ${activeDiag.message}` : "";

            const prompt = `Phân tích đoạn mã Python sau tại dòng chứa con trỏ:
---
${codeSnippet}
---
${errorContext}

Yêu cầu trả về bằng tiếng Việt chuyên nghiệp, súc tích:
1. Giải thích ngắn gọn chức năng của hàm hoặc câu lệnh.
2. Liệt kê các tham số đầu vào yêu cầu (ví dụ: cần truyền chuỗi "up", "down").
3. Nếu có lỗi cú pháp hoặc thiếu sót, đề xuất cách sửa lỗi.`;

            try {
                const aiPromise = runNodeLlamaCpp(prompt);
                const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout")), 4000));
                const aiExplanation: any = await Promise.race([aiPromise, timeoutPromise]);

                if (aiExplanation && aiExplanation.trim() !== "") {
                    return new vscode.Hover(`**Phân tích từ AI:**\n\n${aiExplanation.trim()}`);
                }
            } catch (e) {
                // Xử lý timeout im lặng, trả về kết quả mặc định
            }

            return new vscode.Hover(`**Dòng mã hiện tại:** \`${currentLineText.trim()}\``);
        }
    });

    context.subscriptions.push(hoverProvider);
}

export function deactivate() {}