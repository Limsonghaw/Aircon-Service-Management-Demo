using System.Text.Json;
using System.Diagnostics;
using System.Text.RegularExpressions;
using Microsoft.Playwright;
using Microsoft.Extensions.Options;
using ShengHengAircon.Api.Options;

namespace ShengHengAircon.Api.Features.Documents;

public sealed class PlaywrightDocumentPdfRenderer(IOptions<CompanyProfileOptions> companyProfile, ILogger<PlaywrightDocumentPdfRenderer>? logger = null
) : IDocumentPdfRenderer, IDisposable
{
    private readonly SemaphoreSlim gate = new(1, 1);
    public async Task<byte[]> RenderAsync(JsonElement snapshot, PrintFields fields, List<List<SignaturePoint>> strokes,
        string signerName, DateTimeOffset signedAt, Guid signatureId, CancellationToken ct)
    {
        // Bounded queue: prevent a burst of requests spawning unbounded browsers.
        if (!await gate.WaitAsync(TimeSpan.FromSeconds(5), ct))
            throw new DocumentException("正在生成其他 PDF，请稍后重试。", 503);
        var stage = "template";
        try
        {
            using var resource = typeof(PlaywrightDocumentPdfRenderer).Assembly.GetManifestResourceStream("DocumentPreview.css")!;
            using var reader = new StreamReader(resource);
            var css = await reader.ReadToEndAsync(ct);
            var html = DocumentHtml.Build(snapshot, fields, strokes, signerName, signedAt, signatureId, css, companyProfile.Value);
            stage = "driver_start";
            using var playwright = await Playwright.CreateAsync();
            stage = "browser_launch";
            logger?.LogDebug("PDF browser executable: {ExecutablePath}", playwright.Chromium.ExecutablePath);
            await using var browser = await playwright.Chromium.LaunchAsync(new() { Headless = true, Timeout = 30000 });
            await using var context = await browser.NewContextAsync(new() { JavaScriptEnabled = false });
            // Never load customer-provided URLs or external resources.
            await context.RouteAsync("**/*", route => route.AbortAsync());
            var page = await context.NewPageAsync();
            page.SetDefaultTimeout(30000);
            stage = "page_content";
            await page.SetContentAsync(html, new() { WaitUntil = WaitUntilState.Load });
            ct.ThrowIfCancellationRequested();
            stage = "pdf_export";
            var bytes = await page.PdfAsync(new() { Format = "A4", PreferCSSPageSize = true, PrintBackground = true });
            ct.ThrowIfCancellationRequested();
            return bytes;
        }
        catch (PlaywrightException exception)
        {
            if (stage == "browser_launch") await LogBrowserAccessAsync(exception, ct);
            // Keep the launch reason visible even when a logging sink drops large exception payloads.
            var reason = exception.Message.Length > 8000 ? exception.Message[..8000] : exception.Message;
            logger?.LogError("PDF failure reason at {Stage}: {Reason}", stage, reason);
            logger?.LogError(exception, "Signed document PDF rendering failed at {Stage} for record {SignatureId}", stage, signatureId);
            throw new DocumentException("PDF 生成失败，签名尚未保存。请稍后重试；若持续失败，请联系管理员查看后端日志。", 503, exception);
        }
        finally { gate.Release(); }
    }
    private async Task LogBrowserAccessAsync(PlaywrightException exception, CancellationToken ct)
    {
        // Diagnose with the same Node executable and inherited environment as this
        // running backend. A successful check in a separate test process is insufficient.
        var match = Regex.Match(exception.Message, @"Executable doesn't exist at ([^\r\n]+)");
        if (!match.Success || logger is null) return;
        var path = match.Groups[1].Value.Trim();
        logger.LogError("PDF runtime PID {Pid}, environment {Environment}, browser {BrowserPath}, .NET file exists {Exists}, browser override {Override}",
            System.Environment.ProcessId,
            System.Environment.GetEnvironmentVariable("ASPNETCORE_ENVIRONMENT") ?? "Production",
            path, File.Exists(path), System.Environment.GetEnvironmentVariable("PLAYWRIGHT_BROWSERS_PATH") ?? "default");
        if (!OperatingSystem.IsWindows()) return;
        var node = System.Environment.GetEnvironmentVariable("PLAYWRIGHT_NODEJS_PATH")
            ?? Path.Combine(AppContext.BaseDirectory, ".playwright", "node", "win32_x64", "node.exe");
        try
        {
            var start = new ProcessStartInfo(node) { UseShellExecute = false, CreateNoWindow = true,
                RedirectStandardOutput = true, RedirectStandardError = true };
            start.ArgumentList.Add("-e");
            start.ArgumentList.Add("const fs=require('fs');const p=process.argv[1];try{fs.accessSync(p);console.log(JSON.stringify({node:process.execPath,version:process.version,access:'ok'}))}catch(e){console.log(JSON.stringify({node:process.execPath,version:process.version,code:e.code,syscall:e.syscall,message:e.message}))}");
            start.ArgumentList.Add(path);
            using var process = Process.Start(start);
            if (process is null) return;
            using var timeout = CancellationTokenSource.CreateLinkedTokenSource(ct);
            timeout.CancelAfter(TimeSpan.FromSeconds(5));
            var output = process.StandardOutput.ReadToEndAsync(timeout.Token);
            var error = process.StandardError.ReadToEndAsync(timeout.Token);
            try { await process.WaitForExitAsync(timeout.Token); }
            catch (OperationCanceledException) { if (!process.HasExited) process.Kill(entireProcessTree: true); throw; }
            logger.LogError("PDF runtime Node access check: {Output}; driver stderr: {Error}", await output, await error);
        }
        catch (Exception diagnosticError) when (diagnosticError is not OutOfMemoryException)
        {
            logger.LogWarning(diagnosticError, "PDF runtime access diagnostic unavailable; original launch failure retained");
        }
    }
    public void Dispose() => gate.Dispose();
}
