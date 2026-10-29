using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.AspNetCore.Hosting;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.Options;
using ShengHengAircon.Api.Features.Customers;
using ShengHengAircon.Api.Options;
using Xunit;

namespace ShengHengAircon.Api.Tests;

public sealed class JobAccessTests(ApiFactory factory) : IClassFixture<ApiFactory>
{
    [Fact]
    public async Task EmployeeJobsRpc_UsesUserIdAndMapsCustomerName()
    {
        var userId = Guid.NewGuid();
        var handler = new RecordingHandler();
        using var http = new HttpClient(handler);
        var repository = new SupabaseJobAccessRepository(http, Microsoft.Extensions.Options.Options.Create(new SupabaseOptions
        { Enabled = true, Url = "https://example.test", ServiceRoleKey = "sb_test" }));
        var jobs = await repository.GetEmployeeJobsAsync(userId, TestContext.Current.CancellationToken);
        Assert.Equal("/rest/v1/rpc/get_employee_jobs", handler.Path);
        Assert.Equal(userId, JsonDocument.Parse(handler.Body!).RootElement.GetProperty("p_user_id").GetGuid());
        Assert.Equal("Customer A", Assert.Single(jobs).CustomerName);
    }

    [Fact]
    public async Task Employee_CannotChangeAccountBindings()
    {
        using var client = factory.CreateClient();
        client.DefaultRequestHeaders.Add("X-Test-Role", "employee");
        using var response = await client.PutAsJsonAsync($"/api/user-employee-links/{Guid.NewGuid()}",
            new { employeeId = Guid.NewGuid() }, TestContext.Current.CancellationToken);
        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }

    [Fact]
    public async Task AdminBindingConflict_ReturnsConflict()
    {
        await using var app = factory.WithWebHostBuilder(builder => builder.ConfigureServices(services =>
        {
            services.RemoveAll<IJobAccessRepository>();
            services.AddSingleton<IJobAccessRepository>(new ConflictRepository());
        }));
        using var client = app.CreateClient();
        client.DefaultRequestHeaders.Add("X-Test-Role", "admin");
        using var response = await client.PutAsJsonAsync($"/api/user-employee-links/{Guid.NewGuid()}",
            new { employeeId = Guid.NewGuid() }, TestContext.Current.CancellationToken);
        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
    }

    private sealed class ConflictRepository : IJobAccessRepository
    {
        public Task<IReadOnlyList<CustomerJobResponse>> GetEmployeeJobsAsync(Guid userId, CancellationToken ct) =>
            Task.FromResult<IReadOnlyList<CustomerJobResponse>>([]);
        public Task<IReadOnlyList<EmployeeAccountLink>> GetLinksAsync(CancellationToken ct) =>
            Task.FromResult<IReadOnlyList<EmployeeAccountLink>>([]);
        public Task<bool> BindEmployeeAsync(Guid userId, Guid? employeeId, CancellationToken ct) =>
            throw new JobAccessException("此员工已绑定其他账号。", 409);
    }

    private sealed class RecordingHandler : HttpMessageHandler
    {
        public string? Path { get; private set; }
        public string? Body { get; private set; }
        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken ct)
        {
            Path = request.RequestUri!.AbsolutePath;
            Body = await request.Content!.ReadAsStringAsync(ct);
            return new(HttpStatusCode.OK) { Content = JsonContent.Create(new[] { new {
                id = Guid.NewGuid(), job_number = "JOB-1", customer_id = Guid.NewGuid(), title = "Service",
                service_date = "2026-10-01", team = "A", status = "scheduled",
                created_at = "2026-10-01T00:00:00Z", updated_at = "2026-10-01T00:00:00Z", customer_name = "Customer A"
            } }) };
        }
    }
}
