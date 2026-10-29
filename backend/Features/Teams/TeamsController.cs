using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using ShengHengAircon.Api.Features.Auth;

namespace ShengHengAircon.Api.Features.Teams;

[ApiController, Route("api/teams"), Authorize(Policy = AuthorizationPolicies.Management)]
public sealed class TeamsController(ITeamRepository repository) : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> GetAll(CancellationToken cancellationToken) =>
        Ok(await repository.GetAllAsync(cancellationToken));

    [HttpPost]
    public async Task<IActionResult> Create(TeamInput input, CancellationToken cancellationToken)
    {
        try
        {
            var team = await repository.CreateTeamAsync(input, cancellationToken);
            return Created($"/api/teams/{team.Id}", team);
        }
        catch (TeamWriteException exception) { return Problem(statusCode: exception.StatusCode, detail: exception.Message); }
    }

    [HttpPut("{id:guid}")]
    public async Task<IActionResult> Update(Guid id, TeamInput input, CancellationToken cancellationToken)
    {
        try
        {
            var team = await repository.UpdateTeamAsync(id, input, cancellationToken);
            return team is null ? NotFound() : Ok(team);
        }
        catch (TeamWriteException exception) { return Problem(statusCode: exception.StatusCode, detail: exception.Message); }
    }

    [HttpPost("{teamId:guid}/employees")]
    public async Task<IActionResult> CreateEmployee(Guid teamId, EmployeeInput input, CancellationToken cancellationToken)
    {
        try
        {
            var employee = await repository.CreateEmployeeAsync(teamId, input, cancellationToken);
            return Created($"/api/employees/{employee.Id}", employee);
        }
        catch (TeamWriteException exception) { return Problem(statusCode: exception.StatusCode, detail: exception.Message); }
    }
}

[ApiController, Route("api/employees"), Authorize(Policy = AuthorizationPolicies.Management)]
public sealed class EmployeesController(ITeamRepository repository) : ControllerBase
{
    [HttpPut("{id:guid}")]
    public async Task<IActionResult> Update(Guid id, EmployeeInput input, CancellationToken cancellationToken)
    {
        var employee = await repository.UpdateEmployeeAsync(id, input, cancellationToken);
        return employee is null ? NotFound() : Ok(employee);
    }
}
