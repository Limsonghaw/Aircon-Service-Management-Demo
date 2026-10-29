using System.Security.Cryptography;
using System.Text.Json;
using Microsoft.Extensions.Options;
using ShengHengAircon.Api.Options;

namespace ShengHengAircon.Api.Features.Expenses;

public sealed class SupabaseExpenseReceiptStore : IExpenseReceiptStore
{
    private readonly HttpClient client;
    public SupabaseExpenseReceiptStore(HttpClient client, IOptions<SupabaseOptions> options)
    {
        var settings = options.Value;
        if (!settings.Enabled) throw new InvalidOperationException("Supabase is disabled.");
        this.client = client;
        client.BaseAddress = new Uri(settings.Url.TrimEnd('/') + "/");
        client.DefaultRequestHeaders.Add("apikey", settings.ServiceRoleKey);
        if (!settings.ServiceRoleKey.StartsWith("sb_", StringComparison.Ordinal))
            client.DefaultRequestHeaders.Authorization = new("Bearer", settings.ServiceRoleKey);
    }
    public async Task<bool> IsManagerAsync(Guid userId, CancellationToken ct)
    {
        var rows = await client.GetFromJsonAsync<JsonElement>($"rest/v1/user_profiles?id=eq.{userId:D}&select=role", ct);
        return rows.GetArrayLength() == 1 && rows[0].GetProperty("role").GetString() is "owner" or "admin";
    }
    public async Task<IReadOnlyList<ExpenseReceipt>> GetAllAsync(Guid expenseId, CancellationToken ct) =>
        await ReadAsync($"expense_id=eq.{expenseId:D}&order=created_at.desc,id.desc", ct);
    public async Task<ExpenseReceipt?> GetAsync(Guid expenseId, Guid receiptId, CancellationToken ct) =>
        (await ReadAsync($"expense_id=eq.{expenseId:D}&id=eq.{receiptId:D}&limit=1", ct)).SingleOrDefault();
    private async Task<List<ExpenseReceipt>> ReadAsync(string query, CancellationToken ct)
    {
        using var response = await client.GetAsync($"rest/v1/expense_receipts?{query}", ct);
        if (!response.IsSuccessStatusCode) throw new ReceiptException("收据资料暂不可用，请联系管理员检查服务配置。", 502);
        return await response.Content.ReadFromJsonAsync<List<ExpenseReceipt>>(ct) ?? [];
    }
    public async Task<ExpenseReceipt> UploadAsync(Guid expenseId, Guid userId, ReceiptUpload upload, CancellationToken ct)
    {
        var id = Guid.NewGuid();
        var path = $"{expenseId:D}/{id:D}{upload.Extension}";
        using var content = new ByteArrayContent(upload.Bytes);
        content.Headers.ContentType = new(upload.ContentType);
        using var response = await client.PostAsync($"storage/v1/object/expense-receipts/{path}", content, ct);
        if (!response.IsSuccessStatusCode) throw new ReceiptException("收据上传失败，请稍后重试。", 502);
        using var registration = await client.PostAsJsonAsync("rest/v1/rpc/register_expense_receipt", new
        {
            p_id = id, p_expense_id = expenseId, p_file_name = upload.FileName, p_content_type = upload.ContentType,
            p_file_size = upload.Bytes.Length, p_sha256 = Convert.ToHexString(SHA256.HashData(upload.Bytes)), p_uploader_id = userId
        }, ct);
        if (registration.IsSuccessStatusCode)
            return await registration.Content.ReadFromJsonAsync<ExpenseReceipt>(ct)
                ?? throw new ReceiptException("收据保存结果未确认，请刷新收据列表后检查。", 502);
        string? code = null;
        try
        {
            var error = await registration.Content.ReadFromJsonAsync<JsonElement>(ct);
            if (error.TryGetProperty("code", out var value)) code = value.GetString();
        }
        catch (JsonException) { /* Unknown outcome: do not delete a possibly registered receipt. */ }
        if (code is "42501" or "23503" or "23514")
        {
            using var cleanup = await client.DeleteAsync($"storage/v1/object/expense-receipts/{path}", CancellationToken.None);
            if (!cleanup.IsSuccessStatusCode) throw new ReceiptException("收据未保存；存在待清理文件，请联系管理员。", 502);
            throw new ReceiptException(code == "42501" ? "只有老板和管理员可以上传收据。" : code == "23503" ? "找不到这项费用。" : "收据资料无效。",
                code == "42501" ? 403 : code == "23503" ? 404 : 400);
        }
        throw new ReceiptException("收据保存结果未确认，请刷新收据列表后检查，避免重复上传。", 502);
    }
    public async Task<byte[]> DownloadAsync(ExpenseReceipt receipt, CancellationToken ct)
    {
        var extension = receipt.ContentType switch { "image/jpeg" => ".jpg", "image/png" => ".png", "application/pdf" => ".pdf", _ => "" };
        if (extension == "" || receipt.StoragePath != $"{receipt.ExpenseId:D}/{receipt.Id:D}{extension}")
            throw new ReceiptException("收据文件路径校验失败，请联系管理员。", 502);
        var bytes = await client.GetByteArrayAsync($"storage/v1/object/authenticated/expense-receipts/{receipt.StoragePath}", ct);
        if (bytes.Length != receipt.FileSize || Convert.ToHexString(SHA256.HashData(bytes)) != receipt.Sha256)
            throw new ReceiptException("收据文件完整性校验失败，请联系管理员。", 502);
        return bytes;
    }
}
