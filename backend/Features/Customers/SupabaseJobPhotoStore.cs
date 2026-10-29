using ShengHengAircon.Api.Features.Expenses;
using System.Security.Cryptography;
using System.Text.Json;
using Microsoft.Extensions.Options;
using ShengHengAircon.Api.Options;

namespace ShengHengAircon.Api.Features.Customers;

public sealed class SupabaseJobPhotoStore : IJobPhotoStore
{
    private readonly HttpClient client;
    public SupabaseJobPhotoStore(HttpClient client, IOptions<SupabaseOptions> options)
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
        using var response = await client.PostAsJsonAsync("rest/v1/rpc/can_access_job_photos",
            new { p_job_id = jobId, p_user_id = userId }, ct);
        response.EnsureSuccessStatusCode();
        return await response.Content.ReadFromJsonAsync<bool>(ct);
    }
    public async Task<IReadOnlyList<JobPhoto>> GetAllAsync(Guid jobId, CancellationToken ct) =>
        await ReadAsync($"job_id=eq.{jobId:D}&order=created_at.desc,id.desc", ct);
    public async Task<JobPhoto?> GetAsync(Guid jobId, Guid photoId, CancellationToken ct) =>
        (await ReadAsync($"job_id=eq.{jobId:D}&id=eq.{photoId:D}&limit=1", ct)).SingleOrDefault();
    private async Task<List<JobPhoto>> ReadAsync(string query, CancellationToken ct)
    {
        using var response = await client.GetAsync($"rest/v1/job_photos?{query}", ct);
        if (!response.IsSuccessStatusCode) throw new JobPhotoException("工作照片资料暂不可用，请联系管理员检查服务配置。", 502);
        return await response.Content.ReadFromJsonAsync<List<JobPhoto>>(ct) ?? [];
    }
    public async Task<JobPhoto> UploadAsync(Guid jobId, Guid userId, ReceiptUpload upload, CancellationToken ct)
    {
        var id = Guid.NewGuid();
        var path = $"{jobId:D}/{id:D}{upload.Extension}";
        using var content = new ByteArrayContent(upload.Bytes);
        content.Headers.ContentType = new(upload.ContentType);
        using var response = await client.PostAsync($"storage/v1/object/job-photos/{path}", content, ct);
        if (!response.IsSuccessStatusCode) throw new JobPhotoException("工作照片上传失败，请稍后重试。", 502);
        using var registration = await client.PostAsJsonAsync("rest/v1/rpc/register_job_photo", new
        {
            p_id = id, p_job_id = jobId, p_file_name = upload.FileName, p_content_type = upload.ContentType,
            p_file_size = upload.Bytes.Length, p_sha256 = Convert.ToHexString(SHA256.HashData(upload.Bytes)), p_uploader_id = userId
        }, ct);
        if (registration.IsSuccessStatusCode)
            return await registration.Content.ReadFromJsonAsync<JobPhoto>(ct)
                ?? throw new JobPhotoException("工作照片保存结果未确认，请刷新工作照片列表后检查。", 502);
        string? code = null;
        try
        {
            var error = await registration.Content.ReadFromJsonAsync<JsonElement>(ct);
            if (error.TryGetProperty("code", out var value)) code = value.GetString();
        }
        catch (JsonException) { /* Unknown outcome: do not delete a possibly registered photo. */ }
        if (code is "42501" or "23503" or "23514")
        {
            using var cleanup = await client.DeleteAsync($"storage/v1/object/job-photos/{path}", CancellationToken.None);
            if (!cleanup.IsSuccessStatusCode) throw new JobPhotoException("工作照片未保存；存在待清理文件，请联系管理员。", 502);
            throw new JobPhotoException(code == "42501" ? "你已无权上传这项工作的照片。" : code == "23503" ? "找不到这项工作。" : "工作照片资料无效。",
                code == "42501" ? 403 : code == "23503" ? 404 : 400);
        }
        throw new JobPhotoException("工作照片保存结果未确认，请刷新工作照片列表后检查，避免重复上传。", 502);
    }
    public async Task<byte[]> DownloadAsync(JobPhoto photo, CancellationToken ct)
    {
        var extension = photo.ContentType switch { "image/jpeg" => ".jpg", "image/png" => ".png", _ => "" };
        if (extension == "" || photo.StoragePath != $"{photo.JobId:D}/{photo.Id:D}{extension}")
            throw new JobPhotoException("工作照片文件路径校验失败，请联系管理员。", 502);
        var bytes = await client.GetByteArrayAsync($"storage/v1/object/authenticated/job-photos/{photo.StoragePath}", ct);
        if (bytes.Length != photo.FileSize || Convert.ToHexString(SHA256.HashData(bytes)) != photo.Sha256)
            throw new JobPhotoException("工作照片文件完整性校验失败，请联系管理员。", 502);
        return bytes;
    }
}
