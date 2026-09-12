declare module "async-retry" {
    function retry<T>(fn: (...args: any[]) => Promise<T> | T, opts?: any): Promise<T>;
    namespace retry {
        type Options = any;
    }
    export = retry;
}