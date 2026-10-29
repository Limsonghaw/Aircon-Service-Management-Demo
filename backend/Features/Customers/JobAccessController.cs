using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using ShengHengAircon.Api.Features.Auth;

namespace ShengHengAircon.Api.Features.Customers;

public sealed record BindEmployeeRequest(Guid? EmployeeId);

[ApiController, Route("api/user-employee-links"), Authorize(Policy = AuthorizationPolicies.Management)]
public sealed class JobAccessController(IJobAccessRepository repository) : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> GetLinks(CancellationToken ct) => Ok(await repository.GetLinksAsync(ct));

    [HttpPut("{userId:guid}")]
    public async Task<IActionResult> Bind(Guid userId, BindEmployeeRequest input, CancellationToken ct)
    {
        try
        {
            return await repository.BindEmployeeAsync(userId, input.EmployeeId, ct) ? NoContent() : NotFound();
        }
        catch (JobAccessException exception)
        { return Problem(statusCode: exception.StatusCode, detail: exception.Message); }
    }
}
