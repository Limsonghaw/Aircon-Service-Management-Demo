using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using ShengHengAircon.Api.Features.Auth;

namespace ShengHengAircon.Api.Features.Expenses;

[ApiController, Route("api/expenses/{expenseId:guid}/receipts"), Authorize(Policy = AuthorizationPolicies.Management)]
[ResponseCache(NoStore = true, Location = ResponseCacheLocation.None)]
public sealed class ExpenseReceiptsController(IExpenseReceiptStore store, IExpenseRepository expenses,
    ILogger<ExpenseReceiptsController> logger) : ControllerBase
{
    private Guid UserId => Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
    [HttpGet]
    public Task<IActionResult> List(Guid expenseId, CancellationToken ct) => ExecuteAsync(async () =>
    {
        if (await expenses.GetAsync(expenseId, ct) is null) return NotFound();
        return Ok((await store.GetAllAsync(expenseId, ct)).Select(r => r.ToResponse()));
    }, ct);

    [HttpPost, Consumes("multipart/form-data")]
    [RequestSizeLimit(11 * 1024 * 1024), RequestFormLimits(MultipartBodyLengthLimit = 11 * 1024 * 1024)]
    public Task<IActionResult> Upload(Guid expenseId, [FromForm] IFormFile? file, CancellationToken ct) => ExecuteAsync(async () =>
    {
        if (await expenses.GetAsync(expenseId, ct) is null) return NotFound();
        if (file is null) return Problem(statusCode: 400, detail: "请选择收据文件。");
        if (file.Length == 0) return Problem(statusCode: 400, detail: "收据文件为空。");
        if (file.Length > ReceiptFileValidation.MaxBytes) return Problem(statusCode: 413, detail: "收据文件不能超过 10 MB。");
        using var memory = new MemoryStream((int)file.Length);
        await file.CopyToAsync(memory, ct);
        var upload = ReceiptFileValidation.Validate(file.FileName, file.ContentType, memory.ToArray());
        var receipt = await store.UploadAsync(expenseId, UserId, upload, ct);
        return CreatedAtAction(nameof(Content), new { expenseId, receiptId = receipt.Id }, receipt.ToResponse());
    }, ct);

    [HttpGet("{receiptId:guid}/file")]
    public Task<IActionResult> Content(Guid expenseId, Guid receiptId, [FromQuery] bool download, CancellationToken ct) => ExecuteAsync(async () =>
    {
        var receipt = await store.GetAsync(expenseId, receiptId, ct);
        if (receipt is null) return NotFound();
        var bytes = await store.DownloadAsync(receipt, ct);
        Response.Headers["X-Content-Type-Options"] = "nosniff";
        if (download) return File(bytes, receipt.ContentType, receipt.FileName);
        Response.Headers.ContentDisposition = "inline";
        return File(bytes, receipt.ContentType);
    }, ct);

    private async Task<IActionResult> ExecuteAsync(Func<Task<IActionResult>> operation, CancellationToken ct)
    {
        try
        {
            if (!await store.IsManagerAsync(UserId, ct)) return Forbid();
            return await operation();
        }
        catch (ReceiptException e) { return Problem(statusCode: e.StatusCode, detail: e.Message); }
        catch (HttpRequestException e)
        {
            logger.LogError(e, "Expense receipt operation failed");
            return Problem(statusCode: 502, detail: "收据请求未完成，请刷新收据列表检查后再重试。");
        }
        catch (OperationCanceledException e) when (!ct.IsCancellationRequested)
        {
            logger.LogWarning(e, "Expense receipt request timed out");
            return Problem(statusCode: 504, detail: "收据请求超时，请刷新收据列表检查后再重试。");
        }
    }
}
