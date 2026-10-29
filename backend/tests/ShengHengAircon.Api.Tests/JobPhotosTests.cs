using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Security.Cryptography;
using System.Text.Json;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using ShengHengAircon.Api.Features.Expenses;
using ShengHengAircon.Api.Features.Customers;
using Xunit;

namespace ShengHengAircon.Api.Tests;

public sealed class JobPhotosTests(ApiFactory factory) : IClassFixture<ApiFactory>
{
    public static readonly byte[] Png = Convert.FromBase64String("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aG3sAAAAASUVORK5CYII=");
    private static readonly Guid JobId = Guid.Parse("50000000-0000-0000-0000-000000000001");
    private static string Url(Guid? id = null) => $"/api/jobs/{id ?? JobId}/photos";
    private Microsoft.AspNetCore.Mvc.Testing.WebApplicationFactory<Program> App(Store store) => factory.WithWebHostBuilder(builder => builder.ConfigureServices(services =>
    {
        services.RemoveAll<IJobPhotoStore>(); services.AddSingleton<IJobPhotoStore>(store);
    }));
    private static MultipartFormDataContent Form(byte[]? bytes = null, string name = "工作照片.png", string type = "image/png")
    {
        var form = new MultipartFormDataContent(); var content = new ByteArrayContent(bytes ?? Png);
        content.Headers.ContentType = new(type); form.Add(content, "file", name); return form;
    }
    [Theory]
    [InlineData("owner")]
    [InlineData("admin")]
    [InlineData("employee")]
    public async Task AllowedUser_UploadsListsViewsAndDownloadsExactPhoto(string role)
    {
        var store = new Store(); await using var app = App(store); using var client = app.CreateClient();
        client.DefaultRequestHeaders.Add("X-Test-Role", role);
        using var form = Form();
        var upload = await client.PostAsync(Url(), form, TestContext.Current.CancellationToken);
        Assert.Equal(HttpStatusCode.Created, upload.StatusCode);
        var raw = await upload.Content.ReadFromJsonAsync<JsonElement>(TestContext.Current.CancellationToken);
        Assert.False(raw.TryGetProperty("storagePath", out _)); Assert.False(raw.TryGetProperty("sha256", out _));
        var photo = raw.Deserialize<JobPhotoResponse>(new JsonSerializerOptions(JsonSerializerDefaults.Web))!;
        Assert.Equal("工作照片.png", photo.FileName);
        var listResponse = await client.GetAsync(Url(), TestContext.Current.CancellationToken);
        Assert.True(listResponse.Headers.CacheControl!.NoStore);
        Assert.Single((await listResponse.Content.ReadFromJsonAsync<List<JobPhotoResponse>>(TestContext.Current.CancellationToken))!);
        var view = await client.GetAsync($"{Url()}/{photo.Id}/file", TestContext.Current.CancellationToken);
        Assert.Equal(HttpStatusCode.OK, view.StatusCode); Assert.Equal(Png, await view.Content.ReadAsByteArrayAsync(TestContext.Current.CancellationToken));
        Assert.Equal("inline", view.Content.Headers.ContentDisposition!.DispositionType);
        Assert.Equal("nosniff", view.Headers.GetValues("X-Content-Type-Options").Single());
        var download = await client.GetAsync($"{Url()}/{photo.Id}/file?download=true", TestContext.Current.CancellationToken);
        Assert.Equal("image/png", download.Content.Headers.ContentType!.MediaType);
        Assert.Equal("attachment", download.Content.Headers.ContentDisposition!.DispositionType);
        Assert.Equal(Png, await download.Content.ReadAsByteArrayAsync(TestContext.Current.CancellationToken));
        Assert.Equal(HttpStatusCode.Forbidden, (await client.GetAsync($"{Url(Guid.NewGuid())}/{photo.Id}/file", TestContext.Current.CancellationToken)).StatusCode);
    }
    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task UnauthorisedUser_CannotListUploadOrDownload(bool anonymous)
    {
        var store = new Store { Allowed = false }; await using var app = App(store); using var client = app.CreateClient();
        if (anonymous) client.DefaultRequestHeaders.Add("X-Test-Anonymous", "true");
        else client.DefaultRequestHeaders.Add("X-Test-Role", "employee");
        var status = anonymous ? HttpStatusCode.Unauthorized : HttpStatusCode.Forbidden;
        Assert.Equal(status, (await client.GetAsync(Url(), TestContext.Current.CancellationToken)).StatusCode);
        using var form = Form(); Assert.Equal(status, (await client.PostAsync(Url(), form, TestContext.Current.CancellationToken)).StatusCode);
        Assert.Equal(status, (await client.GetAsync($"{Url()}/{Guid.NewGuid()}/file", TestContext.Current.CancellationToken)).StatusCode);
        Assert.Equal(0, store.Calls);
    }
    [Fact]
    public async Task StaleManagementCookie_IsRejectedByLiveProfile()
    {
        var store = new Store { Allowed = false }; await using var app = App(store); using var client = app.CreateClient();
        Assert.Equal(HttpStatusCode.Forbidden, (await client.GetAsync(Url(), TestContext.Current.CancellationToken)).StatusCode);
        using var form = Form(); Assert.Equal(HttpStatusCode.Forbidden, (await client.PostAsync(Url(), form, TestContext.Current.CancellationToken)).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await client.GetAsync($"{Url()}/{Guid.NewGuid()}/file", TestContext.Current.CancellationToken)).StatusCode);
        Assert.Equal(0, store.Calls);
    }
    [Theory]
    [InlineData("photo.png", "image/png")]
    [InlineData("photo.svg", "image/svg+xml")]
    [InlineData("photo.pdf", "application/pdf")]
    public async Task UnsupportedOrDisguisedFile_IsRejectedBeforeStorage(string name, string type)
    {
        var store = new Store(); await using var app = App(store); using var client = app.CreateClient();
        using var form = Form("<script>not a photo</script>"u8.ToArray(), name, type);
        Assert.Equal(HttpStatusCode.BadRequest, (await client.PostAsync(Url(), form, TestContext.Current.CancellationToken)).StatusCode);
        Assert.Equal(0, store.Calls);
    }
    [Fact]
    public async Task MissingEmptyOversizedAndInaccessibleJob_DoNotUpload()
    {
        var store = new Store(); await using var app = App(store); using var client = app.CreateClient();
        using var missing = new MultipartFormDataContent();
        Assert.Equal(HttpStatusCode.BadRequest, (await client.PostAsync(Url(), missing, TestContext.Current.CancellationToken)).StatusCode);
        using var empty = Form([]);
        Assert.Equal(HttpStatusCode.BadRequest, (await client.PostAsync(Url(), empty, TestContext.Current.CancellationToken)).StatusCode);
        using var large = Form(new byte[ReceiptFileValidation.MaxBytes + 1]);
        Assert.Equal(HttpStatusCode.RequestEntityTooLarge, (await client.PostAsync(Url(), large, TestContext.Current.CancellationToken)).StatusCode);
        using var missingExpense = Form();
        Assert.Equal(HttpStatusCode.Forbidden, (await client.PostAsync(Url(Guid.NewGuid()), missingExpense, TestContext.Current.CancellationToken)).StatusCode);
        Assert.Equal(0, store.Calls);
    }
    [Fact]
    public void FileValidation_CanonicalisesJpegAndSanitisesPaths()
    {
        var result = ReceiptFileValidation.Validate("C:\\fakepath\\photo.JPEG", "application/octet-stream", [255, 216, 255, 224, 255, 217]);
        Assert.Equal("photo.JPEG", result.FileName); Assert.Equal(".jpg", result.Extension); Assert.Equal("image/jpeg", result.ContentType);
        Assert.Throws<ReceiptException>(() => ReceiptFileValidation.Validate("photo.png", "text/html", Png));
        Assert.Throws<ReceiptException>(() => ReceiptFileValidation.Validate("photo.png", "image/png", Png[..^12]));
        Assert.Equal("application/pdf", ReceiptFileValidation.Validate("photo.pdf", "application/pdf", "%PDF-1.4\n%%EOF\n"u8.ToArray()).ContentType);
    }
    [Fact]
    public async Task ValidPdf_IsNotAWorkPhoto()
    {
        var store = new Store(); await using var app = App(store); using var client = app.CreateClient();
        using var form = Form("%PDF-1.4\n%%EOF\n"u8.ToArray(), "work.pdf", "application/pdf");
        Assert.Equal(HttpStatusCode.BadRequest, (await client.PostAsync(Url(), form, TestContext.Current.CancellationToken)).StatusCode);
        Assert.Equal(0, store.Calls);
    }
    private sealed class Store : IJobPhotoStore
    {
        public bool Allowed { get; init; } = true;
        public int Calls { get; private set; }
        private readonly List<JobPhoto> photos = [];
        private readonly Dictionary<Guid, byte[]> files = [];
        public Task<bool> CanAccessAsync(Guid jobId, Guid userId, CancellationToken ct) => Task.FromResult(Allowed && jobId == JobId);
        public Task<IReadOnlyList<JobPhoto>> GetAllAsync(Guid jobId, CancellationToken ct)
        { Calls++; return Task.FromResult<IReadOnlyList<JobPhoto>>(photos.Where(r => r.JobId == jobId).ToList()); }
        public Task<JobPhoto?> GetAsync(Guid jobId, Guid photoId, CancellationToken ct)
        { Calls++; return Task.FromResult(photos.SingleOrDefault(r => r.Id == photoId && r.JobId == jobId)); }
        public Task<JobPhoto> UploadAsync(Guid jobId, Guid userId, ReceiptUpload upload, CancellationToken ct)
        {
            Calls++; var id = Guid.NewGuid();
            var photo = new JobPhoto(id, jobId, upload.FileName, upload.ContentType, upload.Bytes.Length,
                $"{jobId}/{id}{upload.Extension}", Convert.ToHexString(SHA256.HashData(upload.Bytes)), userId, "Test User", DateTimeOffset.UtcNow);
            photos.Add(photo); files.Add(id, upload.Bytes); return Task.FromResult(photo);
        }
        public Task<byte[]> DownloadAsync(JobPhoto photo, CancellationToken ct) { Calls++; return Task.FromResult(files[photo.Id]); }
    }
}
