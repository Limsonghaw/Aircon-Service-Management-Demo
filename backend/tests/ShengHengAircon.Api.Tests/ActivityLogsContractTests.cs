using System.Net;
using System.Net.Http.Json;
using Microsoft.AspNetCore.Hosting;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using ShengHengAircon.Api.Features.ActivityLogs;
using Xunit;

namespace ShengHengAircon.Api.Tests;

public sealed class ActivityLogsContractTests(ApiFactory factory) : IClassFixture<ApiFactory>
{
    [Fact]
    public async Task GetRecent_ReturnsRequestedActivityLogs()
    {
        var repository = new FakeRepository();
        await using var app = factory.WithWebHostBuilder(builder => builder.ConfigureServices(services =>
        {
            services.RemoveAll<IActivityLogRepository>();
            services.AddSingleton<IActivityLogRepository>(repository);
        }));
        using var client = app.CreateClient();
        var ct = TestContext.Current.CancellationToken;

        var logs = await client.GetFromJsonAsync<List<ActivityLogResponse>>("/api/activity-logs?limit=25", ct);

        var log = Assert.Single(logs!);
        Assert.Equal(25, repository.RequestedLimit);
        Assert.Equal("quote_converted", log.Action);
        Assert.Equal("invoice", log.EntityType);
    }

    [Fact]
    public async Task GetRecent_RejectsLimitOutsideAllowedRange()
    {
        await using var app = factory.WithWebHostBuilder(builder => builder.ConfigureServices(services =>
        {
            services.RemoveAll<IActivityLogRepository>();
            services.AddSingleton<IActivityLogRepository>(new FakeRepository());
        }));
        using var client = app.CreateClient();

        using var response = await client.GetAsync(
            "/api/activity-logs?limit=201", TestContext.Current.CancellationToken);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Theory]
    [InlineData("page=0")]
    [InlineData("pageSize=101")]
    [InlineData("action=invalid")]
    [InlineData("entityType=invalid")]
    [InlineData("from=2026-10-02&to=2026-10-01")]
    public async Task Page_RejectsInvalidFilters(string query)
    {
        await using var app = factory.WithWebHostBuilder(builder => builder.ConfigureServices(services =>
        {
            services.RemoveAll<IActivityLogRepository>();
            services.AddSingleton<IActivityLogRepository>(new FakeRepository());
        }));
        using var client = app.CreateClient();
        using var response = await client.GetAsync("/api/activity-logs/page?" + query, TestContext.Current.CancellationToken);
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task Page_ForwardsFiltersAndRejectsEmployeeAccess()
    {
        var repository = new FakeRepository();
        await using var app = factory.WithWebHostBuilder(builder => builder.ConfigureServices(services =>
        {
            services.RemoveAll<IActivityLogRepository>();
            services.AddSingleton<IActivityLogRepository>(repository);
        }));
        using var client = app.CreateClient();
        var ct = TestContext.Current.CancellationToken;
        var page = await client.GetFromJsonAsync<ActivityLogPageResponse>("/api/activity-logs/page?page=2&pageSize=10&action=updated&entityType=quote&search=ABC&from=2026-10-01&to=2026-10-02", ct);
        Assert.Equal(2, page!.Page);
        Assert.Equal(10, page.PageSize);
        Assert.Equal("updated", repository.Query!.Action);
        Assert.Equal("quote", repository.Query.EntityType);
        Assert.Equal("ABC", repository.Query.Search);
        Assert.Equal(new DateOnly(2026, 10, 1), repository.Query.From);
        client.DefaultRequestHeaders.Add("X-Test-Role", "employee");
        using var denied = await client.GetAsync("/api/activity-logs/page", ct);
        Assert.Equal(HttpStatusCode.Forbidden, denied.StatusCode);
    }

    private sealed class FakeRepository : IActivityLogRepository
    {
        public ActivityLogQuery? Query { get; private set; }
        public Task<ActivityLogPageResponse> GetPageAsync(ActivityLogQuery query, CancellationToken ct)
        {
            Query = query;
            return Task.FromResult(new ActivityLogPageResponse([], 0, query.Page, query.PageSize));
        }

        public int RequestedLimit { get; private set; }

        public Task<IReadOnlyList<ActivityLogResponse>> GetRecentAsync(
            int limit, CancellationToken cancellationToken)
        {
            RequestedLimit = limit;
            return Task.FromResult<IReadOnlyList<ActivityLogResponse>>([
                new(1, "quote_converted", "invoice", Guid.NewGuid(), "INV-1001", null,
                    "系统", null, null, DateTimeOffset.Parse("2026-09-30T08:00:00Z"))
            ]);
        }
    }
}
