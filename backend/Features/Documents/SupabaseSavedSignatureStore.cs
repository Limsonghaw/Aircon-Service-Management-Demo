using System.ComponentModel.DataAnnotations;
using System.Security.Cryptography;
using System.Text.Json;

namespace ShengHengAircon.Api.Features.Documents;

public sealed partial class SupabaseDocumentStore
{
    private static readonly JsonSerializerOptions SignatureJson = new(JsonSerializerDefaults.Web);
    public async Task<SavedSignature?> GetSavedSignatureAsync(Guid userId, CancellationToken ct)
    {
        using var response = await client.GetAsync(
            $"rest/v1/owner_saved_signatures?user_id=eq.{userId:D}&select=id,storage_path,signature_sha256,updated_at", ct);
        if (!response.IsSuccessStatusCode)
            throw new DocumentException("常用签名暂不可用，请联系管理员检查服务配置。", 503);
        var rows = await response.Content.ReadFromJsonAsync<JsonElement>(ct);
        if (rows.GetArrayLength() == 0) return null;
        var row = rows[0];
        var id = row.GetProperty("id").GetGuid();
        var path = row.GetProperty("storage_path").GetString();
        if (path != $"{userId:D}/{id:D}.json") throw InvalidSavedSignature();
        var bytes = await client.GetByteArrayAsync($"storage/v1/object/authenticated/owner-signatures/{path}", ct);
        if (bytes.Length > 1048576 || Convert.ToHexString(SHA256.HashData(bytes)) != row.GetProperty("signature_sha256").GetString())
            throw InvalidSavedSignature();
        SignatureStrokesRequest? signature;
        try { signature = JsonSerializer.Deserialize<SignatureStrokesRequest>(bytes, SignatureJson); }
        catch (JsonException) { throw InvalidSavedSignature(); }
        if (signature is null || !Validator.TryValidateObject(signature, new(signature), new List<ValidationResult>(), true))
            throw InvalidSavedSignature();
        return new(id, row.GetProperty("updated_at").GetDateTimeOffset(), signature.Strokes);
    }

    public async Task<SavedSignature> SaveMySignatureAsync(Guid userId, SaveMySignatureRequest request, CancellationToken ct)
    {
        var id = Guid.NewGuid();
        var path = $"{userId:D}/{id:D}.json";
        var bytes = JsonSerializer.SerializeToUtf8Bytes(new SignatureStrokesRequest { Strokes = request.Strokes }, SignatureJson);
        using var content = new ByteArrayContent(bytes);
        content.Headers.ContentType = new("application/json");
        using var upload = await client.PostAsync($"storage/v1/object/owner-signatures/{path}", content, ct);
        if (!upload.IsSuccessStatusCode)
            throw new DocumentException("常用签名上传失败，请稍后重试；若持续失败，请联系管理员。", 502);
        using var registration = await client.PostAsJsonAsync("rest/v1/rpc/save_owner_signature", new
        {
            p_user_id = userId, p_id = id, p_expected_id = request.ExpectedId,
            p_storage_path = path, p_signature_sha256 = Convert.ToHexString(SHA256.HashData(bytes))
        }, ct);
        if (registration.IsSuccessStatusCode)
        {
            var result = await registration.Content.ReadFromJsonAsync<JsonElement>(ct);
            return new(id, result.GetProperty("updated_at").GetDateTimeOffset(), request.Strokes);
        }
        string? code = null;
        try
        {
            var error = await registration.Content.ReadFromJsonAsync<JsonElement>(ct);
            if (error.TryGetProperty("code", out var value)) code = value.GetString();
        }
        catch (JsonException) { /* Unknown result: retain the object for reconciliation. */ }
        if (code is "42501" or "40001" or "23514")
        {
            using var cleanup = await client.DeleteAsync($"storage/v1/object/owner-signatures/{path}", CancellationToken.None);
            if (!cleanup.IsSuccessStatusCode)
                throw new DocumentException("常用签名未保存；上传文件待清理，请联系管理员。", 502);
            throw new DocumentException(code == "42501" ? "只有老板可以保存常用签名。" : "常用签名已变更，请重新载入后再保存。",
                code == "42501" ? 403 : 409);
        }
        // A timeout or unrecognised response may follow a committed transaction.
        throw new DocumentException("常用签名保存结果未确认，请重新载入常用签名后检查。", 502);
    }
    private static DocumentException InvalidSavedSignature() => new("常用签名完整性校验失败，请联系管理员。", 502);
}
