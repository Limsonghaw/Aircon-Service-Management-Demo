using System.Net;
using System.Net.Http.Json;
using System.Security.Cryptography;
using System.Text.Json;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using ShengHengAircon.Api.Features.Documents;
using ShengHengAircon.Api.Features.Expenses;
using Xunit;

namespace ShengHengAircon.Api.Tests;

public sealed class CustomerReturnedDocumentsTests(ApiFactory factory) : IClassFixture<ApiFactory>
{
    internal static readonly Guid DocumentId = Guid.Parse("50000000-0000-0000-0000-000000000001");
    internal static readonly Guid UserId = Guid.Parse("10000000-0000-0000-0000-000000000001");
    internal static readonly byte[] Pdf = "%PDF-1.4\nPO isolated test\n%%EOF\n"u8.ToArray();
    private static string Url(Guid? job = null, string kind = "quote") => $"/api/documents/{kind}/{job ?? DocumentId}/customer-returned-pdfs";
    private Microsoft.AspNetCore.Mvc.Testing.WebApplicationFactory<Program> App(Store store) => factory.WithWebHostBuilder(builder => builder.ConfigureServices(services =>
    {
        services.RemoveAll<ICustomerReturnedDocumentStore>(); services.AddSingleton<ICustomerReturnedDocumentStore>(store);
    }));
    private static MultipartFormDataContent Form(byte[]? bytes = null, string name = "采购订单.pdf", string type = "application/pdf")
    {
        var form = new MultipartFormDataContent(); var content = new ByteArrayContent(bytes ?? Pdf);
        content.Headers.ContentType = new(type); form.Add(content, "file", name); return form;
    }
    [Theory]
    [InlineData("owner", "quote")]
    [InlineData("admin", "quote")]
    [InlineData("owner", "invoice")]
    [InlineData("admin", "invoice")]
    public async Task Management_UploadsRetriesViewsDownloadsAndPreservesHistory(string role, string kind)
    {
        var store = new Store(); await using var app = App(store); using var client = app.CreateClient();
        client.DefaultRequestHeaders.Add("X-Test-Role", role);
        var id = Guid.NewGuid(); var ct = TestContext.Current.CancellationToken;
        using var first = Form(); using var created = await client.PostAsync($"{Url(kind: kind)}/{id}", first, ct);
        Assert.Equal(HttpStatusCode.Created, created.StatusCode);
        var json = await created.Content.ReadFromJsonAsync<JsonElement>(ct);
        Assert.Equal(id, json.GetProperty("id").GetGuid());
        Assert.False(json.TryGetProperty("storagePath", out _)); Assert.False(json.TryGetProperty("sha256", out _));
        using var repeat = Form(); Assert.Equal(HttpStatusCode.Created, (await client.PostAsync($"{Url(kind: kind)}/{id}", repeat, ct)).StatusCode);
        using var second = Form(name: "补充采购订单.pdf");
        Assert.Equal(HttpStatusCode.Created, (await client.PostAsync($"{Url(kind: kind)}/{Guid.NewGuid()}", second, ct)).StatusCode);
        using var list = await client.GetAsync(Url(kind: kind), ct);
        Assert.True(list.Headers.CacheControl!.NoStore);
        Assert.Equal(2, (await list.Content.ReadFromJsonAsync<List<CustomerReturnedDocumentResponse>>(ct))!.Count);
        using var view = await client.GetAsync($"{Url(kind: kind)}/{id}/file", ct);
        Assert.Equal(Pdf, await view.Content.ReadAsByteArrayAsync(ct));
        Assert.Equal("application/pdf", view.Content.Headers.ContentType!.MediaType);
        Assert.Equal("inline", view.Content.Headers.ContentDisposition!.DispositionType);
        Assert.Equal("nosniff", view.Headers.GetValues("X-Content-Type-Options").Single());
        using var download = await client.GetAsync($"{Url(kind: kind)}/{id}/file?download=true", ct);
        Assert.Equal("attachment", download.Content.Headers.ContentDisposition!.DispositionType);
        Assert.Equal(Pdf, await download.Content.ReadAsByteArrayAsync(ct));
        // Management has access to both jobs, but a file still belongs to only one.
        Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync($"{Url(Guid.NewGuid(), kind)}/{id}/file", ct)).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync($"{Url(kind: kind == "quote" ? "invoice" : "quote")}/{id}/file", ct)).StatusCode);
    }
    [Theory]
    [InlineData("employee", false, 403)]
    [InlineData("owner", true, 401)]
    [InlineData("owner", false, 403)]
    [InlineData("admin", false, 403)]
    public async Task EmployeeAnonymousAndStaleManagementCannotAccessPo(string role, bool anonymous, int status)
    {
        var store = new Store { Allowed = false }; await using var app = App(store); using var client = app.CreateClient();
        client.DefaultRequestHeaders.Add("X-Test-Role", role);
        if (anonymous) client.DefaultRequestHeaders.Add("X-Test-Anonymous", "true");
        var id = Guid.NewGuid(); var ct = TestContext.Current.CancellationToken;
        Assert.Equal((HttpStatusCode)status, (await client.GetAsync(Url(), ct)).StatusCode);
        using var file = Form(); Assert.Equal((HttpStatusCode)status, (await client.PostAsync($"{Url()}/{id}", file, ct)).StatusCode);
        Assert.Equal((HttpStatusCode)status, (await client.GetAsync($"{Url()}/{id}/file", ct)).StatusCode);
        Assert.Equal((HttpStatusCode)status, (await client.GetAsync($"{Url()}/{id}/file?download=true", ct)).StatusCode);
        Assert.Equal(0, store.Calls);
    }
    [Theory]
    [InlineData("po.pdf", "application/pdf", false)]
    [InlineData("po.png", "image/png", false)]
    [InlineData("po.pdf", "text/html", true)]
    public async Task DisguisedOrWrongTypeFilesAreRejected(string name, string type, bool realPdf)
    {
        var store = new Store(); await using var app = App(store); using var client = app.CreateClient();
        using var file = Form(realPdf ? Pdf : "not a PDF"u8.ToArray(), name, type);
        Assert.Equal(HttpStatusCode.BadRequest, (await client.PostAsync($"{Url()}/{Guid.NewGuid()}", file, TestContext.Current.CancellationToken)).StatusCode);
        Assert.Equal(0, store.Calls);
    }
    [Fact]
    public async Task MissingEmptyOversizeAndEmptyIdAreRejectedBeforeStorage()
    {
        var store = new Store(); await using var app = App(store); using var client = app.CreateClient();
        var ct = TestContext.Current.CancellationToken;
        using var missing = new MultipartFormDataContent();
        Assert.Equal(HttpStatusCode.BadRequest, (await client.PostAsync($"{Url()}/{Guid.NewGuid()}", missing, ct)).StatusCode);
        using var empty = Form([]);
        Assert.Equal(HttpStatusCode.BadRequest, (await client.PostAsync($"{Url()}/{Guid.NewGuid()}", empty, ct)).StatusCode);
        using var large = Form(new byte[CustomerReturnedFileValidation.MaxBytes + 1]);
        Assert.Equal(HttpStatusCode.RequestEntityTooLarge, (await client.PostAsync($"{Url()}/{Guid.NewGuid()}", large, ct)).StatusCode);
        using var emptyId = Form();
        Assert.Equal(HttpStatusCode.BadRequest, (await client.PostAsync($"{Url()}/{Guid.Empty}", emptyId, ct)).StatusCode);
        Assert.Equal(0, store.Calls);
    }
    [Fact]
    public async Task ExactTenMbPdfIsAcceptedAndFilenameIsSanitised()
    {
        var bytes = new byte[CustomerReturnedFileValidation.MaxBytes]; Pdf.CopyTo(bytes, 0); "\n%%EOF\n"u8.CopyTo(bytes.AsSpan(bytes.Length - 7));
        var upload = CustomerReturnedFileValidation.Validate("C:\\fakepath\\采购订单.PDF", "application/octet-stream", bytes);
        Assert.Equal("采购订单.PDF", upload.FileName);
        var store = new Store(); await using var app = App(store); using var client = app.CreateClient();
        using var file = Form(bytes);
        Assert.Equal(HttpStatusCode.Created, (await client.PostAsync($"{Url()}/{Guid.NewGuid()}", file, TestContext.Current.CancellationToken)).StatusCode);
    }
    [Fact]
    public async Task StoreFailureDoesNotReportSuccessAndSameFileCanRetry()
    {
        var store = new Store { FailNext = true }; await using var app = App(store); using var client = app.CreateClient();
        var id = Guid.NewGuid(); var ct = TestContext.Current.CancellationToken;
        using var first = Form(); Assert.Equal(HttpStatusCode.BadGateway, (await client.PostAsync($"{Url()}/{id}", first, ct)).StatusCode);
        using var retry = Form(); Assert.Equal(HttpStatusCode.Created, (await client.PostAsync($"{Url()}/{id}", retry, ct)).StatusCode);
        Assert.Single((await client.GetFromJsonAsync<List<CustomerReturnedDocumentResponse>>(Url(), ct))!);
    }
    private sealed class Store : ICustomerReturnedDocumentStore
    {
        public bool Allowed { get; init; } = true;
        public bool FailNext { get; set; }
        public int Calls { get; private set; }
        private readonly Dictionary<Guid, CustomerReturnedDocument> documents = [];
        private readonly Dictionary<Guid, byte[]> files = [];
        public Task<bool> CanAccessAsync(string kind, Guid documentId, Guid userId, CancellationToken ct) => Task.FromResult(Allowed);
        public Task<IReadOnlyList<CustomerReturnedDocument>> GetAllAsync(string kind, Guid documentId, CancellationToken ct)
        { Calls++; return Task.FromResult<IReadOnlyList<CustomerReturnedDocument>>(documents.Values.Where(d => d.Kind == kind && d.DocumentId == documentId).ToList()); }
        public Task<CustomerReturnedDocument?> GetAsync(string kind, Guid documentId, Guid attachmentId, CancellationToken ct)
        { Calls++; return Task.FromResult(documents.Values.SingleOrDefault(d => d.Kind == kind && d.DocumentId == documentId && d.Id == attachmentId)); }
        public Task<CustomerReturnedDocument> UploadAsync(string kind, Guid documentId, Guid id, Guid userId, ReceiptUpload upload, CancellationToken ct)
        {
            Calls++; if (FailNext) { FailNext = false; throw new HttpRequestException("Isolated failure"); }
            if (documents.TryGetValue(id, out var existing)) return Task.FromResult(existing);
            var document = new CustomerReturnedDocument(id, kind, documentId, upload.FileName, "application/pdf", upload.Bytes.Length,
                $"{kind}/{documentId:D}/{id:D}.pdf", Convert.ToHexString(SHA256.HashData(upload.Bytes)), userId, "Test User", DateTimeOffset.UtcNow);
            documents.Add(id, document); files.Add(id, upload.Bytes); return Task.FromResult(document);
        }
        public Task<byte[]> DownloadAsync(CustomerReturnedDocument document, CancellationToken ct) { Calls++; return Task.FromResult(files[document.Id]); }
    }
}
