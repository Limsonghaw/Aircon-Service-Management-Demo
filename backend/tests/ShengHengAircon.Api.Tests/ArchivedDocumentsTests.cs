using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using ShengHengAircon.Api.Features.Documents;
using ShengHengAircon.Api.Features.Expenses;
using Xunit;

namespace ShengHengAircon.Api.Tests;
public sealed class ArchivedDocumentsTests(ApiFactory factory) : IClassFixture<ApiFactory>
{
    private static readonly Guid Customer = Guid.Parse("51000000-0000-0000-0000-000000000001");
    private static readonly byte[] Pdf = "%PDF-1.4\nIsolated archive QA\n%%EOF\n"u8.ToArray();
    private Microsoft.AspNetCore.Mvc.Testing.WebApplicationFactory<Program> App(Store store) => factory.WithWebHostBuilder(builder =>
        builder.ConfigureServices(services => { services.RemoveAll<IArchivedDocumentStore>(); services.AddSingleton<IArchivedDocumentStore>(store); }));
    private static MultipartFormDataContent Form(bool duplicate = false, byte[]? bytes = null, Guid? customer = null)
    {
        var form = new MultipartFormDataContent();
        form.Add(new StringContent((customer ?? Customer).ToString()), "customerId");
        form.Add(new StringContent(duplicate.ToString()), "confirmDuplicate");
        var file = new ByteArrayContent(bytes ?? Pdf); file.Headers.ContentType = new("application/pdf");
        form.Add(file, "file", "QA-original.pdf"); return form;
    }
    [Theory]
    [InlineData("owner", "quote")]
    [InlineData("admin", "invoice")]
    public async Task OptionalMetadataAndOriginalBytesArePreserved(string role, string kind)
    {
        var store = new Store(); await using var app = App(store); using var client = app.CreateClient();
        client.DefaultRequestHeaders.Add("X-Test-Role", role);
        var ct = TestContext.Current.CancellationToken; var id = Guid.NewGuid(); var path = $"/api/document-archives/{kind}";
        using var form = Form(); var response = await client.PostAsync($"{path}/{id}", form, ct);
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        var saved = await response.Content.ReadFromJsonAsync<JsonElement>(ct);
        Assert.Equal(JsonValueKind.Null, saved.GetProperty("originalDate").ValueKind);
        Assert.Equal(JsonValueKind.Null, saved.GetProperty("originalNumber").ValueKind);
        Assert.False(saved.TryGetProperty("amount", out _)); Assert.False(saved.TryGetProperty("status", out _)); Assert.False(saved.TryGetProperty("storagePath", out _));
        using var retry = Form(); Assert.Equal(HttpStatusCode.Created, (await client.PostAsync($"{path}/{id}", retry, ct)).StatusCode);
        Assert.Single((await client.GetFromJsonAsync<JsonElement[]>(path, ct))!);
        var view = await client.GetAsync($"{path}/{id}/file", ct);
        Assert.Equal(Pdf, await view.Content.ReadAsByteArrayAsync(ct));
        Assert.Equal("inline", view.Content.Headers.ContentDisposition!.DispositionType);
        var download = await client.GetAsync($"{path}/{id}/file?download=true", ct);
        Assert.Equal("attachment", download.Content.Headers.ContentDisposition!.DispositionType);
        Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync($"/api/document-archives/{(kind == "quote" ? "invoice" : "quote")}/{id}/file", ct)).StatusCode);
    }
    [Theory]
    [InlineData("employee", false, true, 403)]
    [InlineData("owner", true, true, 401)]
    [InlineData("owner", false, false, 403)]
    [InlineData("admin", false, false, 403)]
    public async Task UnauthorizedRequestsDoNotReachFiles(string role, bool anonymous, bool allowed, int status)
    {
        var store = new Store { Allowed = allowed }; await using var app = App(store); using var client = app.CreateClient();
        client.DefaultRequestHeaders.Add("X-Test-Role", role); if (anonymous) client.DefaultRequestHeaders.Add("X-Test-Anonymous", "true");
        var ct = TestContext.Current.CancellationToken; var path = "/api/document-archives/invoice";
        Assert.Equal((HttpStatusCode)status, (await client.GetAsync(path, ct)).StatusCode);
        using var form = Form(); Assert.Equal((HttpStatusCode)status, (await client.PostAsync($"{path}/{Guid.NewGuid()}", form, ct)).StatusCode);
        Assert.Equal((HttpStatusCode)status, (await client.GetAsync($"{path}/{Guid.NewGuid()}/file", ct)).StatusCode);
        Assert.Empty(store.Items);
    }
    [Fact]
    public async Task DuplicateConfirmationFailureRetryAndInvalidFiles()
    {
        var store = new Store { Duplicate = true }; await using var app = App(store); using var client = app.CreateClient();
        var ct = TestContext.Current.CancellationToken; var path = $"/api/document-archives/invoice/{Guid.NewGuid()}";
        using var first = Form(); Assert.Equal(HttpStatusCode.UnprocessableEntity, (await client.PostAsync(path, first, ct)).StatusCode);
        Assert.Empty(store.Items); store.FailNext = true;
        using var second = Form(true); Assert.Equal(HttpStatusCode.BadGateway, (await client.PostAsync(path, second, ct)).StatusCode);
        using var third = Form(true); Assert.Equal(HttpStatusCode.Created, (await client.PostAsync(path, third, ct)).StatusCode);
        using var invalid = Form(bytes: "fake PDF"u8.ToArray()); Assert.Equal(HttpStatusCode.BadRequest, (await client.PostAsync(path, invalid, ct)).StatusCode);
        using var wrongCustomer = Form(customer: Guid.NewGuid()); Assert.Equal(HttpStatusCode.Forbidden, (await client.PostAsync(path, wrongCustomer, ct)).StatusCode);
        Assert.Single(store.Items);
    }
    private sealed class Store : IArchivedDocumentStore
    {
        public bool Allowed = true, Duplicate, FailNext;
        public readonly Dictionary<Guid, ArchivedDocument> Items = [];
        public Task<bool> CanAccessAsync(Guid userId, Guid? customerId, CancellationToken ct) => Task.FromResult(Allowed && (customerId is null || customerId == Customer));
        public Task<IReadOnlyList<ArchivedDocument>> ListAsync(string kind, CancellationToken ct) => Task.FromResult<IReadOnlyList<ArchivedDocument>>(Items.Values.Where(x => x.Kind == kind).ToList());
        public Task<ArchivedDocument?> GetAsync(string kind, Guid id, CancellationToken ct) => Task.FromResult(Items.Values.SingleOrDefault(x => x.Id == id && x.Kind == kind));
        public Task<ArchivedDocument> UploadAsync(string kind, Guid id, Guid customerId, string? number, DateOnly? date, bool confirmDuplicate, Guid userId, ReceiptUpload upload, CancellationToken ct)
        {
            if (Duplicate && !confirmDuplicate) throw new CustomerReturnedDocumentException("Duplicate", 422);
            if (FailNext) { FailNext = false; throw new HttpRequestException("QA offline"); }
            if (!Items.ContainsKey(id)) Items[id] = new(id, kind, customerId, "Isolated QA", number, date, upload.FileName, upload.Bytes.Length, "private", "hash", userId, DateTimeOffset.UtcNow);
            return Task.FromResult(Items[id]);
        }
        public Task<byte[]> DownloadAsync(ArchivedDocument document, CancellationToken ct) => Task.FromResult(Pdf);
    }
}
