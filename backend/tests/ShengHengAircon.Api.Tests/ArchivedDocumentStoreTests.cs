using System.Net;
using System.Net.Http.Json;
using System.Security.Cryptography;
using System.Text.Json;
using ShengHengAircon.Api.Features.Documents;
using ShengHengAircon.Api.Options;
using Xunit;

namespace ShengHengAircon.Api.Tests;
public sealed class ArchivedDocumentStoreTests
{
    private static readonly Guid Customer = Guid.Parse("51000000-0000-0000-0000-000000000001");
    private static readonly Guid User = Guid.Parse("10000000-0000-0000-0000-000000000001");
    private static readonly byte[] Pdf = "%PDF-1.4\narchive QA\n%%EOF\n"u8.ToArray();
    private static SupabaseArchivedDocumentStore Store(HttpClient client) => new(client, Microsoft.Extensions.Options.Options.Create(new SupabaseOptions { Enabled = true, Url = "https://example.test", ServiceRoleKey = "sb_secret_qa_only" }));
    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task LostResponseCanRetryWithoutOverwritingOrDeleting(bool afterCompletion)
    {
        var handler = new Handler { LoseStorage = !afterCompletion, LoseComplete = afterCompletion }; using var http = new HttpClient(handler);
        var store = Store(http); var id = Guid.NewGuid(); var ct = TestContext.Current.CancellationToken;
        var file = CustomerReturnedFileValidation.Validate("qa.pdf", "application/pdf", Pdf);
        await Assert.ThrowsAsync<HttpRequestException>(() => store.UploadAsync("invoice", id, Customer, null, null, false, User, file, ct));
        var saved = await store.UploadAsync("invoice", id, Customer, null, null, false, User, file, ct);
        Assert.Equal(id, saved.Id); Assert.Equal(1, handler.Writes); Assert.True(handler.Ready);
        Assert.Equal(Pdf, await store.DownloadAsync(saved, ct));
        Assert.DoesNotContain(handler.Methods, method => method == HttpMethod.Put || method == HttpMethod.Patch || method == HttpMethod.Delete);
        await Assert.ThrowsAsync<CustomerReturnedDocumentException>(() => store.DownloadAsync(saved with { CustomerId = Guid.NewGuid() }, ct));
        handler.Bytes = "different"u8.ToArray();
        await Assert.ThrowsAsync<CustomerReturnedDocumentException>(() => store.DownloadAsync(saved, ct));
    }
    [Theory]
    [InlineData("P0002", 422)]
    [InlineData("42501", 403)]
    [InlineData("23505", 409)]
    public async Task ReservationFailurePreventsStorageWrite(string code, int status)
    {
        var handler = new Handler { Error = code }; using var http = new HttpClient(handler);
        var failure = await Assert.ThrowsAsync<CustomerReturnedDocumentException>(() => Store(http).UploadAsync("quote", Guid.NewGuid(), Customer,
            "QT-1", null, false, User, CustomerReturnedFileValidation.Validate("qa.pdf", "application/pdf", Pdf), TestContext.Current.CancellationToken));
        Assert.Equal(status, failure.StatusCode); Assert.Equal(0, handler.Writes);
    }
    [Fact]
    public async Task PendingRecordsAreNotListedOrDownloadableAndLiveRoleIsChecked()
    {
        var handler = new Handler(); using var http = new HttpClient(handler); var store = Store(http); var ct = TestContext.Current.CancellationToken;
        Assert.True(await store.CanAccessAsync(User, Customer, ct));
        Assert.Empty(await store.ListAsync("invoice", ct));
        Assert.Null(await store.GetAsync("invoice", Guid.NewGuid(), ct));
        Assert.All(handler.Queries, query => Assert.Contains("ready=eq.true", query));
    }
    private sealed class Handler : HttpMessageHandler
    {
        public bool LoseStorage, LoseComplete, Ready;
        public string? Error;
        public int Writes;
        public byte[]? Bytes;
        private ArchivedDocument? saved;
        public List<HttpMethod> Methods = [];
        public List<string> Queries = [];
        private static HttpResponseMessage Json(object value, HttpStatusCode status = HttpStatusCode.OK) => new(status) { Content = JsonContent.Create(value) };
        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken ct)
        {
            Methods.Add(request.Method); var uri = request.RequestUri!;
            if (uri.AbsolutePath.EndsWith("can_access_document_archives"))
            {
                var body = await request.Content!.ReadFromJsonAsync<JsonElement>(ct);
                Assert.Equal(User, body.GetProperty("p_user_id").GetGuid()); Assert.Equal(Customer, body.GetProperty("p_customer_id").GetGuid()); return Json(true);
            }
            if (uri.AbsolutePath.EndsWith("reserve_document_archive"))
            {
                if (Error is not null) return Json(new { code = Error }, HttpStatusCode.BadRequest);
                var body = await request.Content!.ReadFromJsonAsync<JsonElement>(ct); var id = body.GetProperty("p_id").GetGuid(); var kind = body.GetProperty("p_kind").GetString()!;
                saved ??= new(id, kind, Customer, "QA", null, null, "qa.pdf", Pdf.Length, $"{kind}/{Customer:D}/{id:D}.pdf", Convert.ToHexString(SHA256.HashData(Pdf)), User, DateTimeOffset.UtcNow);
                return Json(saved);
            }
            if (uri.AbsolutePath.EndsWith("complete_document_archive"))
            {
                Assert.NotNull(Bytes); Ready = true;
                if (LoseComplete) { LoseComplete = false; throw new HttpRequestException("QA lost response after completion"); }
                return Json(saved!);
            }
            if (uri.AbsolutePath == "/rest/v1/document_archives") { Queries.Add(uri.Query); return Json(Array.Empty<ArchivedDocument>()); }
            Assert.StartsWith("/storage/v1/object/", uri.AbsolutePath);
            if (request.Method == HttpMethod.Post)
            {
                Assert.False(request.Headers.Contains("x-upsert"));
                if (Bytes is not null) return Json(new { error = "Duplicate" }, HttpStatusCode.BadRequest);
                Bytes = await request.Content!.ReadAsByteArrayAsync(ct); Writes++;
                if (LoseStorage) { LoseStorage = false; throw new HttpRequestException("QA lost upload response"); }
                return Json(new { });
            }
            Assert.Contains("/authenticated/document-archives/", uri.AbsolutePath);
            return new(HttpStatusCode.OK) { Content = new ByteArrayContent(Bytes!) };
        }
    }
}
