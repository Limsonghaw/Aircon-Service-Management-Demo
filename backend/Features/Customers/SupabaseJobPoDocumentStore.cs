using System.Net;
using System.Security.Cryptography;
using System.Text.Json;
using Microsoft.Extensions.Options;
using ShengHengAircon.Api.Features.Expenses;
using ShengHengAircon.Api.Options;

namespace ShengHengAircon.Api.Features.Customers;

public sealed class SupabaseJobPoDocumentStore : IJobPoDocumentStore
{
    private readonly HttpClient client;
    public SupabaseJobPoDocumentStore(HttpClient client, IOptions<SupabaseOptions> options)
    {
        var settings = options.Value;
        if (!settings.Enabled) throw new InvalidOperationException("Supabase is disabled.");
        this.client = client;
        client.BaseAddress = new Uri(settings.Url.TrimEnd('/') + "/");
        client.DefaultRequestHeaders.Add("apikey", settings.ServiceRoleKey);
        if (!settings.ServiceRoleKey.StartsWith("sb_", StringComparison.Ordinal))
            client.DefaultRequestHeaders.Authorization = new("Bearer", settings.ServiceRoleKey);
    }
    public async Task<bool> CanAccessAsync(Guid jobId, Guid userId, CancellationToken ct)
    {
        using var response = await client.PostAsJsonAsync("rest/v1/rpc/can_access_job_po_documents",
            new { p_job_id = jobId, p_user_id = userId }, ct);
        response.EnsureSuccessStatusCode();
        return await response.Content.ReadFromJsonAsync<bool>(ct);
    }
    public async Task<IReadOnlyList<JobPoDocument>> GetAllAsync(Guid jobId, CancellationToken ct) =>
        await ReadAsync($"job_id=eq.{jobId:D}&order=created_at.desc,id.desc", ct);
    public async Task<JobPoDocument?> GetAsync(Guid jobId, Guid documentId, CancellationToken ct) =>
        (await ReadAsync($"job_id=eq.{jobId:D}&id=eq.{documentId:D}&limit=1", ct)).SingleOrDefault();
    private async Task<List<JobPoDocument>> ReadAsync(string query, CancellationToken ct)
    {
        using var response = await client.GetAsync($"rest/v1/job_po_documents?{query}", ct);
        response.EnsureSuccessStatusCode();
        return await response.Content.ReadFromJsonAsync<List<JobPoDocument>>(ct)
            ?? throw new JobPoDocumentException("PO 文件列表未确认，请重试。", 502);
    }

    private static string PathFor(Guid jobId, Guid documentId) => $"{jobId:D}/{documentId:D}.pdf";
    private static bool Matches(JobPoDocument saved, Guid jobId, Guid documentId, Guid userId, ReceiptUpload upload, string hash) =>
        saved.Id == documentId && saved.JobId == jobId && saved.UploadedBy == userId
        && saved.FileName == upload.FileName && saved.ContentType == "application/pdf"
        && saved.FileSize == upload.Bytes.Length && saved.Sha256 == hash
        && saved.StoragePath == PathFor(jobId, documentId);

    public async Task<JobPoDocument> UploadAsync(Guid jobId, Guid documentId, Guid userId, ReceiptUpload upload, CancellationToken ct)
    {
        var hash = Convert.ToHexString(SHA256.HashData(upload.Bytes));
        var path = PathFor(jobId, documentId);
        var existing = await GetAsync(jobId, documentId, ct);
        if (existing is not null)
        {
            if (!Matches(existing, jobId, documentId, userId, upload, hash))
                throw new JobPoDocumentException("附件编号已用于其他文件，请重新选择 PDF；历史文件会保留。", 409);
            // Revalidate the live role inside the atomic RPC, also for a confirmed retry.
            return await RegisterAsync(jobId, documentId, userId, upload, hash, ct);
        }
        using var content = new ByteArrayContent(upload.Bytes);
        content.Headers.ContentType = new("application/pdf");
        using var response = await client.PostAsync($"storage/v1/object/job-po-documents/{path}", content, ct);
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
            if (!duplicate) throw new JobPoDocumentException("PO PDF 上传未完成，请重试同一文件。", 502);
            // An earlier attempt may have stored bytes before its response was lost.
            // Never upsert, overwrite or delete the object. Only reuse identical bytes.
            var stored = await client.GetByteArrayAsync($"storage/v1/object/authenticated/job-po-documents/{path}", ct);
            if (stored.Length != upload.Bytes.Length || Convert.ToHexString(SHA256.HashData(stored)) != hash)
                throw new JobPoDocumentException("已存在的附件内容不同，请重新选择 PDF；历史文件会保留。", 409);
        }
        return await RegisterAsync(jobId, documentId, userId, upload, hash, ct);
    }
    private async Task<JobPoDocument> RegisterAsync(Guid jobId, Guid documentId, Guid userId,
        ReceiptUpload upload, string hash, CancellationToken ct)
    {
        using var response = await client.PostAsJsonAsync("rest/v1/rpc/register_job_po_document", new
        {
            p_id = documentId, p_job_id = jobId, p_file_name = upload.FileName, p_content_type = "application/pdf",
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
            throw new JobPoDocumentException(code switch
            {
                "42501" => "当前账号无权上传 PO PDF。",
                "23503" => "找不到这项工作或上传人。",
                "23514" or "23502" => "PO 文件资料无效，请重新选择 PDF。",
                "23505" => "附件编号已用于其他上传，请重新选择文件；历史文件会保留。",
                _ => "PO PDF 保存结果未确认，请重试同一文件。"
            }, code switch { "42501" => 403, "23503" => 404, "23514" or "23502" => 400, "23505" => 409, _ => 502 });
        }
        var saved = await response.Content.ReadFromJsonAsync<JobPoDocument>(ct);
        if (saved is null || !Matches(saved, jobId, documentId, userId, upload, hash)
            || saved.CreatedAt == default || string.IsNullOrWhiteSpace(saved.UploadedByName))
            throw new JobPoDocumentException("PO PDF 保存结果未确认，请重试同一文件。", 502);
        return saved;
    }
    public async Task<byte[]> DownloadAsync(JobPoDocument document, CancellationToken ct)
    {
        if (document.ContentType != "application/pdf" || document.StoragePath != PathFor(document.JobId, document.Id)
            || document.FileSize is <= 0 or > JobPoFileValidation.MaxBytes)
            throw new JobPoDocumentException("PO PDF 文件路径或资料校验失败。", 502);
        var bytes = await client.GetByteArrayAsync($"storage/v1/object/authenticated/job-po-documents/{document.StoragePath}", ct);
        if (bytes.Length != document.FileSize || Convert.ToHexString(SHA256.HashData(bytes)) != document.Sha256)
            throw new JobPoDocumentException("PO PDF 文件完整性校验失败，请联系管理员。", 502);
        return bytes;
    }
}
