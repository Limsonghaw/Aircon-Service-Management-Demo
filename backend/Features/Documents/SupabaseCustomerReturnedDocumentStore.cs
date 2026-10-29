using System.Net;
using System.Security.Cryptography;
using System.Text.Json;
using Microsoft.Extensions.Options;
using ShengHengAircon.Api.Features.Expenses;
using ShengHengAircon.Api.Options;

namespace ShengHengAircon.Api.Features.Documents;

public sealed class SupabaseCustomerReturnedDocumentStore : ICustomerReturnedDocumentStore
{
    private readonly HttpClient client;
    public SupabaseCustomerReturnedDocumentStore(HttpClient client, IOptions<SupabaseOptions> options)
    {
        var settings = options.Value;
        if (!settings.Enabled) throw new InvalidOperationException("Supabase is disabled.");
        this.client = client;
        client.BaseAddress = new Uri(settings.Url.TrimEnd('/') + "/");
        client.DefaultRequestHeaders.Add("apikey", settings.ServiceRoleKey);
        if (!settings.ServiceRoleKey.StartsWith("sb_", StringComparison.Ordinal))
            client.DefaultRequestHeaders.Authorization = new("Bearer", settings.ServiceRoleKey);
    }
    public async Task<bool> CanAccessAsync(string kind, Guid documentId, Guid userId, CancellationToken ct)
    {
        using var response = await client.PostAsJsonAsync("rest/v1/rpc/can_access_customer_returned_documents",
            new { p_kind = kind, p_document_id = documentId, p_user_id = userId }, ct);
        response.EnsureSuccessStatusCode();
        return await response.Content.ReadFromJsonAsync<bool>(ct);
    }
    public async Task<IReadOnlyList<CustomerReturnedDocument>> GetAllAsync(string kind, Guid documentId, CancellationToken ct) =>
        await ReadAsync($"kind=eq.{kind}&document_id=eq.{documentId:D}&order=created_at.desc,id.desc", ct);
    public async Task<CustomerReturnedDocument?> GetAsync(string kind, Guid documentId, Guid attachmentId, CancellationToken ct) =>
        (await ReadAsync($"kind=eq.{kind}&document_id=eq.{documentId:D}&id=eq.{attachmentId:D}&limit=1", ct)).SingleOrDefault();
    private async Task<List<CustomerReturnedDocument>> ReadAsync(string query, CancellationToken ct)
    {
        using var response = await client.GetAsync($"rest/v1/customer_returned_documents?{query}", ct);
        response.EnsureSuccessStatusCode();
        return await response.Content.ReadFromJsonAsync<List<CustomerReturnedDocument>>(ct)
            ?? throw new CustomerReturnedDocumentException("客户签回文件列表未确认，请重试。", 502);
    }

    private static string PathFor(string kind, Guid documentId, Guid attachmentId) => $"{kind}/{documentId:D}/{attachmentId:D}.pdf";
    private static bool Matches(CustomerReturnedDocument saved, string kind, Guid documentId, Guid attachmentId, Guid userId, ReceiptUpload upload, string hash) =>
        saved.Kind == kind && saved.Id == attachmentId && saved.DocumentId == documentId && saved.UploadedBy == userId
        && saved.FileName == upload.FileName && saved.ContentType == "application/pdf"
        && saved.FileSize == upload.Bytes.Length && saved.Sha256 == hash
        && saved.StoragePath == PathFor(kind, documentId, attachmentId);

    public async Task<CustomerReturnedDocument> UploadAsync(string kind, Guid documentId, Guid attachmentId, Guid userId, ReceiptUpload upload, CancellationToken ct)
    {
        var hash = Convert.ToHexString(SHA256.HashData(upload.Bytes));
        var path = PathFor(kind, documentId, attachmentId);
        var existing = await GetAsync(kind, documentId, attachmentId, ct);
        if (existing is not null)
        {
            if (!Matches(existing, kind, documentId, attachmentId, userId, upload, hash))
                throw new CustomerReturnedDocumentException("附件编号已用于其他文件，请重新选择 PDF；历史文件会保留。", 409);
            // Revalidate the live role inside the atomic RPC, also for a confirmed retry.
            return await RegisterAsync(kind, documentId, attachmentId, userId, upload, hash, ct);
        }
        using var content = new ByteArrayContent(upload.Bytes);
        content.Headers.ContentType = new("application/pdf");
        using var response = await client.PostAsync($"storage/v1/object/customer-returned-documents/{path}", content, ct);
        if (!response.IsSuccessStatusCode)
        {
            var duplicate = response.StatusCode == HttpStatusCode.Conflict;
            if (!duplicate && response.StatusCode == HttpStatusCode.BadRequest)
            {
                try
                {
                    var error = await response.Content.ReadFromJsonAsync<JsonElement>(ct);
                    duplicate = error.TryGetProperty("error", out var code) && code.GetString() == "Duplicate";
                }
                catch (JsonException) { /* A non-JSON storage error is not a confirmed duplicate. */ }
            }
            if (!duplicate) throw new CustomerReturnedDocumentException("客户签回 PDF 上传未完成，请重试同一文件。", 502);
            // An earlier attempt may have stored bytes before its response was lost.
            // Never upsert, overwrite or delete the object. Only reuse identical bytes.
            var stored = await client.GetByteArrayAsync($"storage/v1/object/authenticated/customer-returned-documents/{path}", ct);
            if (stored.Length != upload.Bytes.Length || Convert.ToHexString(SHA256.HashData(stored)) != hash)
                throw new CustomerReturnedDocumentException("已存在的附件内容不同，请重新选择 PDF；历史文件会保留。", 409);
        }
        return await RegisterAsync(kind, documentId, attachmentId, userId, upload, hash, ct);
    }
    private async Task<CustomerReturnedDocument> RegisterAsync(string kind, Guid documentId, Guid attachmentId, Guid userId,
        ReceiptUpload upload, string hash, CancellationToken ct)
    {
        using var response = await client.PostAsJsonAsync("rest/v1/rpc/register_customer_returned_document", new
        {
            p_id = attachmentId, p_kind = kind, p_document_id = documentId, p_file_name = upload.FileName, p_content_type = "application/pdf",
            p_file_size = upload.Bytes.Length, p_sha256 = hash, p_uploader_id = userId
        }, ct);
        if (!response.IsSuccessStatusCode)
        {
            string? code = null;
            try
            {
                var error = await response.Content.ReadFromJsonAsync<JsonElement>(ct);
                if (error.TryGetProperty("code", out var value)) code = value.GetString();
            }
            catch (JsonException) { /* Unknown result: retain the stored object for a safe retry. */ }
            throw new CustomerReturnedDocumentException(code switch
            {
                "42501" => "当前账号无权上传 客户签回 PDF。",
                "23503" => "找不到这张单据或上传人。",
                "23514" or "23502" => "客户签回文件资料无效，请重新选择 PDF。",
                "23505" => "附件编号已用于其他上传，请重新选择文件；历史文件会保留。",
                _ => "客户签回 PDF 保存结果未确认，请重试同一文件。"
            }, code switch { "42501" => 403, "23503" => 404, "23514" or "23502" => 400, "23505" => 409, _ => 502 });
        }
        var saved = await response.Content.ReadFromJsonAsync<CustomerReturnedDocument>(ct);
        if (saved is null || !Matches(saved, kind, documentId, attachmentId, userId, upload, hash)
            || saved.CreatedAt == default || string.IsNullOrWhiteSpace(saved.UploadedByName))
            throw new CustomerReturnedDocumentException("客户签回 PDF 保存结果未确认，请重试同一文件。", 502);
        return saved;
    }
    public async Task<byte[]> DownloadAsync(CustomerReturnedDocument document, CancellationToken ct)
    {
        if (document.ContentType != "application/pdf" || document.StoragePath != PathFor(document.Kind, document.DocumentId, document.Id)
            || document.FileSize is <= 0 or > CustomerReturnedFileValidation.MaxBytes)
            throw new CustomerReturnedDocumentException("客户签回 PDF 文件路径或资料校验失败。", 502);
        var bytes = await client.GetByteArrayAsync($"storage/v1/object/authenticated/customer-returned-documents/{document.StoragePath}", ct);
        if (bytes.Length != document.FileSize || Convert.ToHexString(SHA256.HashData(bytes)) != document.Sha256)
            throw new CustomerReturnedDocumentException("客户签回 PDF 文件完整性校验失败，请联系管理员。", 502);
        return bytes;
    }
}
