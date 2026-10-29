using System.Net;
using System.Net.Http.Json;
using System.Security.Cryptography;
using System.Text.Json;
using ShengHengAircon.Api.Features.Expenses;
using ShengHengAircon.Api.Features.Customers;
using ShengHengAircon.Api.Options;
using Xunit;

namespace ShengHengAircon.Api.Tests;

public sealed class JobPhotoStoreTests
{
    private static readonly Guid JobId = Guid.Parse("50000000-0000-0000-0000-000000000001");
    private static readonly Guid UserId = Guid.Parse("10000000-0000-0000-0000-000000000001");
    private static ReceiptUpload File() => ReceiptFileValidation.Validate("工作照片.png", "image/png", JobPhotosTests.Png);
    private static SupabaseJobPhotoStore Store(HttpClient client, string key = "sb_secret_test") => new(client,
        Microsoft.Extensions.Options.Options.Create(new SupabaseOptions { Enabled = true, Url = "https://example.test", ServiceRoleKey = key }));
    [Theory]
    [InlineData("sb_secret_test", false)]
    [InlineData("legacy-jwt-test", true)]
    public async Task StorageUploadAndAtomicRegistration_UseCorrectHeadersAndServerMetadata(string key, bool bearer)
    {
        var handler = new Handler(); using var client = new HttpClient(handler); var store = Store(client, key);
        var photo = await store.UploadAsync(JobId, UserId, File(), TestContext.Current.CancellationToken);
        Assert.Equal(bearer, handler.Bearer); Assert.True(handler.ApiKey);
        Assert.Equal("image/png", handler.Type);
        Assert.Equal($"/storage/v1/object/job-photos/{JobId:D}/{photo.Id:D}.png", handler.Paths[0]);
        var payload = handler.Payload!.Value;
        Assert.Equal(JobId, payload.GetProperty("p_job_id").GetGuid());
        Assert.Equal(UserId, payload.GetProperty("p_uploader_id").GetGuid());
        Assert.Equal(File().Bytes.Length, payload.GetProperty("p_file_size").GetInt32());
        Assert.Equal(Convert.ToHexString(SHA256.HashData(File().Bytes)), payload.GetProperty("p_sha256").GetString());
    }
    [Theory]
    [InlineData("42501", 403, true)]
    [InlineData("23503", 404, true)]
    [InlineData("23514", 400, true)]
    [InlineData("unknown", 502, false)]
    public async Task RejectedRegistration_RemovesOnlyTheUnregisteredUpload(string code, int status, bool cleanup)
    {
        var handler = new Handler { ErrorCode = code }; using var client = new HttpClient(handler); var store = Store(client);
        var error = await Assert.ThrowsAsync<JobPhotoException>(() => store.UploadAsync(JobId, UserId, File(), TestContext.Current.CancellationToken));
        Assert.Equal(status, error.StatusCode); Assert.Equal(cleanup ? 3 : 2, handler.Paths.Count);
        if (cleanup) { Assert.Equal(handler.Paths[0], handler.Paths[2]); Assert.Equal(HttpMethod.Delete, handler.Method); }
    }
    [Fact]
    public async Task UploadFailure_DoesNotRegisterAnAttachment()
    {
        var handler = new Handler { UploadFailure = true }; using var client = new HttpClient(handler);
        await Assert.ThrowsAsync<JobPhotoException>(() => Store(client).UploadAsync(JobId, UserId, File(), TestContext.Current.CancellationToken));
        Assert.Single(handler.Paths);
    }
    [Fact]
    public async Task RegistrationTimeout_PreservesPossiblyRegisteredFile()
    {
        var handler = new Handler { RegistrationTimeout = true }; using var client = new HttpClient(handler);
        await Assert.ThrowsAsync<TaskCanceledException>(() => Store(client).UploadAsync(JobId, UserId, File(), TestContext.Current.CancellationToken));
        Assert.Equal(2, handler.Paths.Count);
    }
    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task DownloadChecksHashAndReadsPrivateObject(bool corrupt)
    {
        var handler = new Handler { Downloading = true, Corrupt = corrupt }; using var client = new HttpClient(handler); var store = Store(client);
        var id = Guid.NewGuid();
        var photo = new JobPhoto(id, JobId, "工作照片.png", "image/png", File().Bytes.Length,
            $"{JobId:D}/{id:D}.png", Convert.ToHexString(SHA256.HashData(File().Bytes)), UserId, "Boss", DateTimeOffset.UtcNow);
        if (corrupt) Assert.Equal(502, (await Assert.ThrowsAsync<JobPhotoException>(() => store.DownloadAsync(photo, TestContext.Current.CancellationToken))).StatusCode);
        else Assert.Equal(File().Bytes, await store.DownloadAsync(photo, TestContext.Current.CancellationToken));
        Assert.Equal($"/storage/v1/object/authenticated/job-photos/{photo.StoragePath}", handler.Paths.Single());
        await Assert.ThrowsAsync<JobPhotoException>(() => store.DownloadAsync(photo with { StoragePath = "../another/file.png" }, TestContext.Current.CancellationToken));
        Assert.Single(handler.Paths);
    }
    private sealed class Handler : HttpMessageHandler
    {
        public string? ErrorCode { get; init; }
        public bool UploadFailure { get; init; }
        public bool RegistrationTimeout { get; init; }
        public bool Downloading { get; init; }
        public bool Corrupt { get; init; }
        public List<string> Paths { get; } = [];
        public bool Bearer { get; private set; }
        public bool ApiKey { get; private set; }
        public string? Type { get; private set; }
        public JsonElement? Payload { get; private set; }
        public HttpMethod? Method { get; private set; }
        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken ct)
        {
            Paths.Add(request.RequestUri!.AbsolutePath); Method = request.Method;
            Bearer = request.Headers.Authorization is not null; ApiKey = request.Headers.Contains("apikey");
            if (Downloading) return new(HttpStatusCode.OK) { Content = new ByteArrayContent(Corrupt ? new byte[File().Bytes.Length] : File().Bytes) };
            if (Paths.Count == 1)
            {
                Type = request.Content!.Headers.ContentType?.MediaType;
                return new(UploadFailure ? HttpStatusCode.BadGateway : HttpStatusCode.OK) { Content = JsonContent.Create(new { }) };
            }
            if (Paths.Count == 2)
            {
                if (RegistrationTimeout) throw new TaskCanceledException("Test timeout after upload");
                Payload = JsonDocument.Parse(await request.Content!.ReadAsStringAsync(ct)).RootElement.Clone();
                if (ErrorCode is not null) return new(HttpStatusCode.BadRequest) { Content = JsonContent.Create(new { code = ErrorCode }) };
                var id = Payload.Value.GetProperty("p_id").GetGuid();
                return new(HttpStatusCode.OK) { Content = JsonContent.Create(new JobPhoto(id, JobId, File().FileName, File().ContentType,
                    File().Bytes.Length, $"{JobId:D}/{id:D}.png", Payload.Value.GetProperty("p_sha256").GetString()!, UserId, "Boss", DateTimeOffset.UtcNow)) };
            }
            return new(HttpStatusCode.OK) { Content = JsonContent.Create(new { }) };
        }
    }
    [Fact]
    public async Task AccessCheck_UsesJobAndUserNotCookieRole()
    {
        using var http = new HttpClient(new AccessHandler());
        Assert.True(await Store(http).CanAccessAsync(JobId, UserId, TestContext.Current.CancellationToken));
    }
    private sealed class AccessHandler : HttpMessageHandler
    {
        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken ct)
        {
            Assert.Equal("/rest/v1/rpc/can_access_job_photos", request.RequestUri!.AbsolutePath);
            Assert.Equal(HttpMethod.Post, request.Method);
            var body = JsonDocument.Parse(await request.Content!.ReadAsStringAsync(ct)).RootElement;
            Assert.Equal(JobId, body.GetProperty("p_job_id").GetGuid());
            Assert.Equal(UserId, body.GetProperty("p_user_id").GetGuid());
            return new(HttpStatusCode.OK) { Content = JsonContent.Create(true) };
        }
    }
}
