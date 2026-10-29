using System.Net;
using System.Net.Http.Json;
using System.Security.Cryptography;
using System.Text.Json;
using ShengHengAircon.Api.Features.Customers;
using ShengHengAircon.Api.Features.Expenses;
using ShengHengAircon.Api.Options;
using Xunit;

namespace ShengHengAircon.Api.Tests;

public sealed class JobPoDocumentStoreTests
{
    private static readonly Guid JobId = JobPoDocumentsTests.JobId;
    private static readonly Guid UserId = JobPoDocumentsTests.UserId;
    private static ReceiptUpload File() => JobPoFileValidation.Validate("采购订单.pdf", "application/pdf", JobPoDocumentsTests.Pdf);
    private static SupabaseJobPoDocumentStore Store(HttpClient client, string key = "sb_secret_test") => new(client,
        Microsoft.Extensions.Options.Options.Create(new SupabaseOptions { Enabled = true, Url = "https://example.test", ServiceRoleKey = key }));
    [Theory]
    [InlineData("sb_secret_test", false)]
    [InlineData("legacy-jwt-test", true)]
    public async Task UploadAndRetryUseStableIdPrivateStorageAndAtomicRpc(string key, bool bearer)
    {
        var handler = new Handler(); using var http = new HttpClient(handler); var store = Store(http, key); var id = Guid.NewGuid(); var ct = TestContext.Current.CancellationToken;
        var first = await store.UploadAsync(JobId, id, UserId, File(), ct);
        var retry = await store.UploadAsync(JobId, id, UserId, File(), ct);
        Assert.Equal(first.Id, retry.Id); Assert.Single(handler.Objects); Assert.Single(handler.Documents);
        Assert.Equal(1, handler.StorageWrites); Assert.Equal(2, handler.RegisterCalls); Assert.Equal(1, handler.NewRegistrations);
        Assert.Equal(bearer, handler.Bearer); Assert.True(handler.ApiKey); Assert.Equal("application/pdf", handler.Type);
        Assert.Equal($"{JobId:D}/{id:D}.pdf", first.StoragePath);
        Assert.DoesNotContain(handler.Methods, method => method == HttpMethod.Delete || method == HttpMethod.Put || method == HttpMethod.Patch);
    }
    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task LostResponseAfterStorageOrRegistrationCanRetryWithoutDuplicate(bool afterRegistration)
    {
        var handler = new Handler { LoseStorageResponse = !afterRegistration, LoseRegistrationResponse = afterRegistration };
        using var http = new HttpClient(handler); var store = Store(http); var id = Guid.NewGuid(); var ct = TestContext.Current.CancellationToken;
        await Assert.ThrowsAsync<HttpRequestException>(() => store.UploadAsync(JobId, id, UserId, File(), ct));
        Assert.Single(handler.Objects);
        await store.UploadAsync(JobId, id, UserId, File(), ct);
        Assert.Single(handler.Objects); Assert.Single(handler.Documents); Assert.Equal(1, handler.NewRegistrations);
        Assert.DoesNotContain(HttpMethod.Delete, handler.Methods);
    }
    [Theory]
    [InlineData("42501", 403)]
    [InlineData("23503", 404)]
    [InlineData("23514", 400)]
    [InlineData("23505", 409)]
    [InlineData("unknown", 502)]
    public async Task FailedRegistrationNeverDeletesStoredFiles(string code, int status)
    {
        var handler = new Handler { RegistrationError = code }; using var http = new HttpClient(handler); var id = Guid.NewGuid();
        var error = await Assert.ThrowsAsync<JobPoDocumentException>(() => Store(http).UploadAsync(JobId, id, UserId, File(), TestContext.Current.CancellationToken));
        Assert.Equal(status, error.StatusCode); Assert.Single(handler.Objects); Assert.Empty(handler.Documents);
        Assert.DoesNotContain(HttpMethod.Delete, handler.Methods);
    }
    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task DifferentBytesCannotOverwriteExistingObjectOrMetadata(bool registered)
    {
        var handler = new Handler(); using var http = new HttpClient(handler); var store = Store(http); var id = Guid.NewGuid(); var ct = TestContext.Current.CancellationToken;
        await store.UploadAsync(JobId, id, UserId, File(), ct);
        if (!registered) handler.Documents.Clear();
        var different = File() with { Bytes = "%PDF-1.4\nDIFFERENT\n%%EOF\n"u8.ToArray() };
        Assert.Equal(409, (await Assert.ThrowsAsync<JobPoDocumentException>(() => store.UploadAsync(JobId, id, UserId, different, ct))).StatusCode);
        Assert.Equal(File().Bytes, handler.Objects.Values.Single());
    }
    [Fact]
    public async Task StorageDuplicateBadRequestCanRecoverUnregisteredObject()
    {
        var handler = new Handler { DuplicateAsBadRequest = true }; using var http = new HttpClient(handler); var store = Store(http); var id = Guid.NewGuid(); var ct = TestContext.Current.CancellationToken;
        await store.UploadAsync(JobId, id, UserId, File(), ct); handler.Documents.Clear();
        await store.UploadAsync(JobId, id, UserId, File(), ct);
        Assert.Single(handler.Documents); Assert.Single(handler.Objects);
    }
    [Fact]
    public async Task DownloadChecksPathSizeHashAndReadsOnlyPrivateObject()
    {
        var handler = new Handler(); using var http = new HttpClient(handler); var store = Store(http); var ct = TestContext.Current.CancellationToken;
        var document = await store.UploadAsync(JobId, Guid.NewGuid(), UserId, File(), ct);
        Assert.Equal(File().Bytes, await store.DownloadAsync(document, ct));
        var calls = handler.Methods.Count;
        await Assert.ThrowsAsync<JobPoDocumentException>(() => store.DownloadAsync(document with { StoragePath = "../other.pdf" }, ct));
        Assert.Equal(calls, handler.Methods.Count);
        handler.Objects[document.StoragePath] = new byte[File().Bytes.Length];
        Assert.Equal(502, (await Assert.ThrowsAsync<JobPoDocumentException>(() => store.DownloadAsync(document, ct))).StatusCode);
    }
    [Fact]
    public async Task LiveAccessRpcUsesAuthenticatedUserAndJob()
    {
        var handler = new Handler(); using var http = new HttpClient(handler);
        Assert.True(await Store(http).CanAccessAsync(JobId, UserId, TestContext.Current.CancellationToken));
    }
    [Fact]
    public async Task UnconfirmedRegistrationResponseCannotReportSuccess()
    {
        var handler = new Handler { InvalidRegistrationResponse = true }; using var http = new HttpClient(handler);
        Assert.Equal(502, (await Assert.ThrowsAsync<JobPoDocumentException>(() => Store(http).UploadAsync(JobId, Guid.NewGuid(), UserId, File(), TestContext.Current.CancellationToken))).StatusCode);
        Assert.Single(handler.Objects);
    }
    private sealed class Handler : HttpMessageHandler
    {
        public Dictionary<Guid, JobPoDocument> Documents { get; } = [];
        public Dictionary<string, byte[]> Objects { get; } = [];
        public List<HttpMethod> Methods { get; } = [];
        public bool LoseStorageResponse { get; set; }
        public bool LoseRegistrationResponse { get; set; }
        public bool DuplicateAsBadRequest { get; init; }
        public bool InvalidRegistrationResponse { get; init; }
        public string? RegistrationError { get; init; }
        public int StorageWrites { get; private set; }
        public int RegisterCalls { get; private set; }
        public int NewRegistrations { get; private set; }
        public bool ApiKey { get; private set; }
        public bool Bearer { get; private set; }
        public string? Type { get; private set; }
        private static HttpResponseMessage Json(object value, HttpStatusCode status = HttpStatusCode.OK) => new(status) { Content = JsonContent.Create(value) };
        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken ct)
        {
            var uri = request.RequestUri!; Methods.Add(request.Method);
            ApiKey = request.Headers.Contains("apikey"); Bearer = request.Headers.Authorization is not null;
            if (uri.AbsolutePath == "/rest/v1/rpc/can_access_job_po_documents")
            {
                var data = await request.Content!.ReadFromJsonAsync<JsonElement>(ct);
                Assert.Equal(JobId, data.GetProperty("p_job_id").GetGuid()); Assert.Equal(UserId, data.GetProperty("p_user_id").GetGuid());
                return Json(true);
            }
            if (uri.AbsolutePath == "/rest/v1/job_po_documents")
            {
                var query = uri.Query.TrimStart('?').Split('&').Select(p => p.Split('=', 2)).ToDictionary(p => p[0], p => p[1]);
                Assert.Equal($"eq.{JobId:D}", query["job_id"]);
                return Json(Documents.Values.Where(d => !query.TryGetValue("id", out var id) || id == $"eq.{d.Id:D}").ToList());
            }
            const string storagePrefix = "/storage/v1/object/job-po-documents/";
            if (uri.AbsolutePath.StartsWith(storagePrefix))
            {
                Assert.Equal(HttpMethod.Post, request.Method); Assert.False(request.Headers.Contains("x-upsert"));
                Type = request.Content!.Headers.ContentType?.MediaType; var path = uri.AbsolutePath[storagePrefix.Length..];
                if (Objects.ContainsKey(path)) return DuplicateAsBadRequest ? Json(new { error = "Duplicate" }, HttpStatusCode.BadRequest) : Json(new { }, HttpStatusCode.Conflict);
                Objects.Add(path, await request.Content.ReadAsByteArrayAsync(ct)); StorageWrites++;
                if (LoseStorageResponse) { LoseStorageResponse = false; throw new HttpRequestException("Lost storage response"); }
                return Json(new { });
            }
            const string downloadPrefix = "/storage/v1/object/authenticated/job-po-documents/";
            if (uri.AbsolutePath.StartsWith(downloadPrefix)) return new(HttpStatusCode.OK) { Content = new ByteArrayContent(Objects[uri.AbsolutePath[downloadPrefix.Length..]]) };
            Assert.Equal("/rest/v1/rpc/register_job_po_document", uri.AbsolutePath);
            RegisterCalls++;
            var payload = await request.Content!.ReadFromJsonAsync<JsonElement>(ct);
            Assert.Equal(JobId, payload.GetProperty("p_job_id").GetGuid()); Assert.Equal(UserId, payload.GetProperty("p_uploader_id").GetGuid());
            Assert.Equal("application/pdf", payload.GetProperty("p_content_type").GetString());
            Assert.Equal(Convert.ToHexString(SHA256.HashData(File().Bytes)), payload.GetProperty("p_sha256").GetString());
            if (RegistrationError is not null) return Json(new { code = RegistrationError }, HttpStatusCode.BadRequest);
            var documentId = payload.GetProperty("p_id").GetGuid();
            if (!Documents.TryGetValue(documentId, out var saved))
            {
                saved = new(documentId, JobId, File().FileName, "application/pdf", File().Bytes.Length,
                    $"{JobId:D}/{documentId:D}.pdf", payload.GetProperty("p_sha256").GetString()!, UserId, "Test User", DateTimeOffset.UtcNow);
                Documents.Add(documentId, saved); NewRegistrations++;
            }
            if (LoseRegistrationResponse) { LoseRegistrationResponse = false; throw new HttpRequestException("Lost registration response"); }
            return Json(InvalidRegistrationResponse ? saved with { JobId = Guid.NewGuid() } : saved);
        }
    }
}
