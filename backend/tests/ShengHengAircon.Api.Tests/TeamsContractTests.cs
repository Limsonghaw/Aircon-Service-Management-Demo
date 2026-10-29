using System.Net;
using System.Net.Http.Json;
using Microsoft.AspNetCore.Hosting;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using ShengHengAircon.Api.Features.Teams;
using Xunit;

namespace ShengHengAircon.Api.Tests;

public sealed class TeamsContractTests(ApiFactory factory) : IClassFixture<ApiFactory>
{
    [Fact]
    public async Task TeamEndpoints_CreateTeamAndManageEmployee()
    {
        var repository = new FakeTeamRepository();
        await using var app = factory.WithWebHostBuilder(builder => builder.ConfigureServices(services =>
        {
            services.RemoveAll<ITeamRepository>();
            services.AddSingleton<ITeamRepository>(repository);
        }));
        using var client = app.CreateClient();
        var cancellationToken = TestContext.Current.CancellationToken;

        using var createTeamResponse = await client.PostAsJsonAsync("/api/teams", new
        {
            name = "Team A", notes = "North area", isActive = true
        }, cancellationToken);
        var team = await createTeamResponse.Content.ReadFromJsonAsync<TeamResponse>(cancellationToken);
        Assert.Equal(HttpStatusCode.Created, createTeamResponse.StatusCode);
        Assert.NotNull(team);

        using var createEmployeeResponse = await client.PostAsJsonAsync($"/api/teams/{team.Id}/employees", new
        {
            teamId = team.Id, name = "Ali", phone = "0123456789", role = "技术员", isActive = true
        }, cancellationToken);
        var employee = await createEmployeeResponse.Content.ReadFromJsonAsync<EmployeeResponse>(cancellationToken);
        Assert.Equal(HttpStatusCode.Created, createEmployeeResponse.StatusCode);
        Assert.Equal(team.Id, employee?.TeamId);

        using var updateEmployeeResponse = await client.PutAsJsonAsync($"/api/employees/{employee!.Id}", new
        {
            teamId = team.Id, name = "Ali", phone = "0123456789", role = "组长", isActive = false
        }, cancellationToken);
        var updated = await updateEmployeeResponse.Content.ReadFromJsonAsync<EmployeeResponse>(cancellationToken);
        Assert.Equal(HttpStatusCode.OK, updateEmployeeResponse.StatusCode);
        Assert.Equal("组长", updated?.Role);
        Assert.False(updated?.IsActive);

        var teams = await client.GetFromJsonAsync<List<TeamResponse>>("/api/teams", cancellationToken);
        Assert.Single(Assert.Single(teams!).Employees);
    }

    [Fact]
    public async Task CreateTeam_RejectsEmptyNameBeforeStorage()
    {
        var repository = new FakeTeamRepository();
        await using var app = factory.WithWebHostBuilder(builder => builder.ConfigureServices(services =>
        {
            services.RemoveAll<ITeamRepository>();
            services.AddSingleton<ITeamRepository>(repository);
        }));
        using var client = app.CreateClient();
        using var response = await client.PostAsJsonAsync("/api/teams", new
        {
            name = "", notes = (string?)null, isActive = true
        }, TestContext.Current.CancellationToken);
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Empty(repository.Teams);
    }

    private sealed class FakeTeamRepository : ITeamRepository
    {
        public List<TeamResponse> Teams { get; } = [];
        public Task<IReadOnlyList<TeamResponse>> GetAllAsync(CancellationToken cancellationToken) =>
            Task.FromResult<IReadOnlyList<TeamResponse>>(Teams);
        public Task<TeamResponse> CreateTeamAsync(TeamInput input, CancellationToken cancellationToken)
        {
            var now = DateTimeOffset.UtcNow;
            var team = new TeamResponse(Guid.NewGuid(), input.Name, input.Notes, input.IsActive, [], now, now);
            Teams.Add(team); return Task.FromResult(team);
        }
        public Task<TeamResponse?> UpdateTeamAsync(Guid id, TeamInput input, CancellationToken cancellationToken) =>
            Task.FromResult<TeamResponse?>(Teams.SingleOrDefault(team => team.Id == id));
        public Task<EmployeeResponse> CreateEmployeeAsync(Guid teamId, EmployeeInput input, CancellationToken cancellationToken)
        {
            var now = DateTimeOffset.UtcNow;
            var employee = new EmployeeResponse(Guid.NewGuid(), teamId, input.Name, input.Phone, input.Role, input.Notes, input.IsActive, now, now);
            var index = Teams.FindIndex(team => team.Id == teamId);
            Teams[index] = Teams[index] with { Employees = [employee] };
            return Task.FromResult(employee);
        }
        public Task<EmployeeResponse?> UpdateEmployeeAsync(Guid id, EmployeeInput input, CancellationToken cancellationToken)
        {
            var employee = Teams.SelectMany(team => team.Employees).SingleOrDefault(item => item.Id == id);
            if (employee is null) return Task.FromResult<EmployeeResponse?>(null);
            var updated = employee with { TeamId = input.TeamId, Name = input.Name, Phone = input.Phone,
                Role = input.Role, Notes = input.Notes, IsActive = input.IsActive, UpdatedAt = DateTimeOffset.UtcNow };
            var teamIndex = Teams.FindIndex(team => team.Employees.Any(item => item.Id == id));
            Teams[teamIndex] = Teams[teamIndex] with { Employees = [updated] };
            return Task.FromResult<EmployeeResponse?>(updated);
        }
    }
}
