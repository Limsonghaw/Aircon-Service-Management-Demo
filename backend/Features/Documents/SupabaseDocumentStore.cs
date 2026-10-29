using System.Net;
using System.Net.Http.Headers;
using System.Text.Json;
using Microsoft.Extensions.Options;
using ShengHengAircon.Api.Options;

namespace ShengHengAircon.Api.Features.Documents;

public sealed partial class SupabaseDocumentStore : IDocumentStore, ISavedSignatureStore
{
    private readonly HttpClient client;
    public SupabaseDocumentStore(HttpClient client, IOptions<SupabaseOptions> options)
    {
        var settings = options.Value;
        if (!settings.Enabled) throw new InvalidOperationException("Supabase is disabled.");
        this.client = client;
        client.BaseAddress = new Uri(settings.Url.TrimEnd('/') + "/");
        client.DefaultRequestHeaders.Add("apikey", settings.ServiceRoleKey);
        if (!settings.ServiceRoleKey.StartsWith("sb_", StringComparison.Ordinal))
            client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", settings.ServiceRoleKey);
    }
    public async Task<JsonElement?> SnapshotAsync(string kind, Guid id, CancellationToken ct)
    {
        using var response = await client.PostAsJsonAsync("rest/v1/rpc/get_document_snapshot", new { p_kind = kind, p_id = id }, ct);
        response.EnsureSuccessStatusCode();
        var value = await response.Content.ReadFromJsonAsync<JsonElement>(ct);
        return value.ValueKind == JsonValueKind.Null ? null : value;
    }
    private async Task<JsonElement?> ProfileAsync(Guid id, CancellationToken ct)
    {
        var profiles = await client.GetFromJsonAsync<JsonElement>($"rest/v1/user_profiles?id=eq.{id:D}&select=role,display_name", ct);
        return profiles.GetArrayLength() == 0 ? null : profiles[0];
    }
    public async Task<bool> IsOwnerAsync(Guid userId, CancellationToken ct) =>
        (await ProfileAsync(userId, ct))?.GetProperty("role").GetString() == "owner";
    public async Task<string> OwnerNameAsync(Guid userId, CancellationToken ct) =>
        (await ProfileAsync(userId, ct))?.GetProperty("display_name").GetString() ?? throw new DocumentException("签名账号不存在。", 403);
    public async Task<IReadOnlyList<SignedDocument>> HistoryAsync(string kind, Guid id, CancellationToken ct)
    {
        var rows = await client.GetFromJsonAsync<JsonElement>($"rest/v1/signed_documents?kind=eq.{kind}&document_id=eq.{id:D}&order=created_at.desc", ct);
        var options = new JsonSerializerOptions(JsonSerializerDefaults.Web);
        return rows.EnumerateArray().Select(r => new SignedDocument(r.GetProperty("id").GetGuid(), kind, id,
            r.GetProperty("snapshot"), r.GetProperty("print_fields").Deserialize<PrintFields>(options)!,
            r.GetProperty("signature").Deserialize<List<List<SignaturePoint>>>(options)!,
            r.GetProperty("signer_id").GetGuid(), r.GetProperty("signer_name").GetString()!,
            r.GetProperty("signed_at").GetDateTimeOffset(), r.GetProperty("storage_path").GetString()!,
            r.GetProperty("pdf_sha256").GetString()!)).ToList();
    }
    public async Task SaveAsync(SignedDocument d, byte[] pdf, CancellationToken ct)
    {
        if (pdf.Length > 10485760) throw new DocumentException("PDF 超过 10 MB，请减少单据内容。", 400);
        using var content = new ByteArrayContent(pdf);
        content.Headers.ContentType = new("application/pdf");
        using var upload = await client.PostAsync($"storage/v1/object/signed-documents/{d.StoragePath}", content, ct);
        if (!upload.IsSuccessStatusCode) throw new DocumentException("PDF 上传失败，请稍后重试。", 502);
        using var response = await client.PostAsJsonAsync("rest/v1/rpc/register_signed_document", new
        {
            p_id = d.Id, p_kind = d.Kind, p_document_id = d.DocumentId, p_snapshot = d.Snapshot,
            p_print_fields = d.Fields, p_signature = d.Strokes, p_signer_id = d.SignerId, p_signer_name = d.SignerName,
            p_signed_at = d.SignedAt, p_storage_path = d.StoragePath, p_pdf_sha256 = d.PdfSha256
        }, ct);
        if (response.IsSuccessStatusCode) return;
        var error = await response.Content.ReadFromJsonAsync<JsonElement>(ct);
        var code = error.TryGetProperty("code", out var property) ? property.GetString() : null;
        // Only remove a file when the DB explicitly rejected registration. A
        // transport timeout may hide a committed transaction; retain for recovery.
        if (code is "40001" or "42501" or "23503" or "23514")
        {
            using var cleanup = await client.DeleteAsync($"storage/v1/object/signed-documents/{d.StoragePath}", CancellationToken.None);
            if (!cleanup.IsSuccessStatusCode)
                throw new DocumentException("签名保存未完成；存在待清理文件，请联系管理员。", 502);
            throw new DocumentException(code == "42501" ? "只有老板可以签名。" : "单据或客户资料已修改，请重新打开预览后签名。",
                code == "42501" ? 403 : 409);
        }
        throw new DocumentException("签名保存结果未确认，请重新打开预览检查历史版本后再重试。", 502);
    }
    public async Task<byte[]> DownloadAsync(string path, CancellationToken ct) =>
        await client.GetByteArrayAsync($"storage/v1/object/authenticated/signed-documents/{path}", ct);
}
