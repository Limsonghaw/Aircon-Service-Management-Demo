using System.Net;
using System.Security.Cryptography;
using System.Text.Json;
using Microsoft.Extensions.Options;
using ShengHengAircon.Api.Features.Expenses;
using ShengHengAircon.Api.Options;

namespace ShengHengAircon.Api.Features.Documents;

public sealed class SupabaseArchivedDocumentStore : IArchivedDocumentStore
{
    private readonly HttpClient client;
    public SupabaseArchivedDocumentStore(HttpClient client, IOptions<SupabaseOptions> options)
    {
        var settings = options.Value;
        if (!settings.Enabled) throw new InvalidOperationException("Supabase is disabled.");
        this.client = client;
        client.BaseAddress = new Uri(settings.Url.TrimEnd('/') + "/");
        client.DefaultRequestHeaders.Add("apikey", settings.ServiceRoleKey);
        if (!settings.ServiceRoleKey.StartsWith("sb_", StringComparison.Ordinal))
            client.DefaultRequestHeaders.Authorization = new("Bearer", settings.ServiceRoleKey);
    }
    public async Task<bool> CanAccessAsync(Guid userId, Guid? customerId, CancellationToken ct)
    {
        using var response = await client.PostAsJsonAsync("rest/v1/rpc/can_access_document_archives", new { p_user_id = userId, p_customer_id = customerId }, ct);
        response.EnsureSuccessStatusCode();
        return await response.Content.ReadFromJsonAsync<bool>(ct);
    }
    public async Task<IReadOnlyList<ArchivedDocument>> ListAsync(string kind, CancellationToken ct) =>
        await Read($"kind=eq.{kind}&order=created_at.desc,id.desc", ct);
    public async Task<ArchivedDocument?> GetAsync(string kind, Guid id, CancellationToken ct) =>
        (await Read($"kind=eq.{kind}&id=eq.{id:D}", ct)).SingleOrDefault();
    private async Task<List<ArchivedDocument>> Read(string query, CancellationToken ct)
    {
        using var response = await client.GetAsync($"rest/v1/document_archives?ready=eq.true&{query}", ct);
        response.EnsureSuccessStatusCode();
        return await response.Content.ReadFromJsonAsync<List<ArchivedDocument>>(ct) ?? throw new JsonException();
    }
    public async Task<ArchivedDocument> UploadAsync(string kind, Guid id, Guid customerId, string? number, DateOnly? date,
        bool confirmDuplicate, Guid userId, ReceiptUpload upload, CancellationToken ct)
    {
        // Reserve metadata first, rechecking role, customer and duplicates atomically. Pending rows are never listed.
        var hash = Convert.ToHexString(SHA256.HashData(upload.Bytes));
        var args = new { p_id = id, p_kind = kind, p_customer_id = customerId, p_number = number, p_date = date,
            p_confirm_duplicate = confirmDuplicate, p_user_id = userId, p_file_name = upload.FileName, p_file_size = upload.Bytes.Length, p_sha256 = hash };
        var reserved = await Rpc("reserve_document_archive", args, ct);
        var path = $"{kind}/{customerId:D}/{id:D}.pdf";
        bool Matches(ArchivedDocument item) => item.Id == id && item.Kind == kind && item.CustomerId == customerId
            && item.UploadedBy == userId && item.OriginalNumber == number && item.OriginalDate == date
            && item.FileName == upload.FileName && item.FileSize == upload.Bytes.Length && item.Sha256 == hash && item.StoragePath == path;
        if (!Matches(reserved)) throw new CustomerReturnedDocumentException("归档文件关联未确认，请重试。", 502);
        using var body = new ByteArrayContent(upload.Bytes);
        body.Headers.ContentType = new("application/pdf");
        using var response = await client.PostAsync($"storage/v1/object/document-archives/{path}", body, ct);
        if (!response.IsSuccessStatusCode)
        {
            var duplicate = response.StatusCode == HttpStatusCode.Conflict;
            if (response.StatusCode == HttpStatusCode.BadRequest)
            {
                try { var error = await response.Content.ReadFromJsonAsync<JsonElement>(ct); duplicate = error.TryGetProperty("error", out var code) && code.GetString() == "Duplicate"; }
                catch (JsonException) { /* Not a confirmed duplicate. */ }
            }
            if (!duplicate) throw new CustomerReturnedDocumentException("原件上传未完成，文件已保留，请重试同一文件。", 502);
            var existing = await client.GetByteArrayAsync($"storage/v1/object/authenticated/document-archives/{path}", ct);
            if (Convert.ToHexString(SHA256.HashData(existing)) != hash)
                throw new CustomerReturnedDocumentException("归档编号已用于不同文件，不能覆盖。", 409);
        }
        var saved = await Rpc("complete_document_archive", new { p_id = id, p_user_id = userId }, ct);
        if (!Matches(saved)) throw new CustomerReturnedDocumentException("归档保存结果未确认，请重试。", 502);
        return saved;
    }
    private async Task<ArchivedDocument> Rpc(string name, object args, CancellationToken ct)
    {
        using var response = await client.PostAsJsonAsync($"rest/v1/rpc/{name}", args, ct);
        if (!response.IsSuccessStatusCode)
        {
            var error = await response.Content.ReadFromJsonAsync<JsonElement>(ct);
            var code = error.TryGetProperty("code", out var value) ? value.GetString() : null;
            throw new CustomerReturnedDocumentException(code switch {
                "P0002" => "原编号与已有同类单据重复。请核对后确认另存，原记录不会被覆盖。",
                "23505" => "此次上传标识已用于其他资料，请重新选择文件后保存。",
                "42501" => "无权访问此归档或客户。", _ => "归档保存未确认，文件已保留，请重试。"
            }, code == "P0002" ? 422 : code == "23505" ? 409 : code == "42501" ? 403 : 502);
        }
        return await response.Content.ReadFromJsonAsync<ArchivedDocument>(ct) ?? throw new JsonException();
    }
    public async Task<byte[]> DownloadAsync(ArchivedDocument document, CancellationToken ct)
    {
        var expected = $"{document.Kind}/{document.CustomerId:D}/{document.Id:D}.pdf";
        if (document.StoragePath != expected) throw new CustomerReturnedDocumentException("原件归属校验失败。", 409);
        var bytes = await client.GetByteArrayAsync($"storage/v1/object/authenticated/document-archives/{expected}", ct);
        if (bytes.LongLength != document.FileSize || Convert.ToHexString(SHA256.HashData(bytes)) != document.Sha256)
            throw new CustomerReturnedDocumentException("原件完整性校验失败，请联系管理员。", 409);
        return bytes;
    }
}
