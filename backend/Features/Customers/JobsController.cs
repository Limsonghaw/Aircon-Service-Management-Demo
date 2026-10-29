using Microsoft.AspNetCore.Authorization;
using System.Security.Claims;
using Microsoft.AspNetCore.Mvc;
using ShengHengAircon.Api.Features.Auth;

namespace ShengHengAircon.Api.Features.Customers;

[ApiController]
[Route("api/jobs")]
[Authorize]
public sealed class JobsController(ICustomerRepository repository) : ControllerBase
{
    [HttpGet("{id:guid}")]
    public async Task<IActionResult> GetDetails(Guid id, CancellationToken ct,
        [FromServices] IServiceProvider services)
    {
        // Resolve the permitted jobs before reading any customer contact details.
        var jobs = User.IsInRole(UserRoles.Employee)
            ? await services.GetRequiredService<IJobAccessRepository>().GetEmployeeJobsAsync(
                Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!), ct)
            : await repository.GetAllJobsAsync(ct);
        var job = jobs.FirstOrDefault(item => item.Id == id);
        if (job is null) return NotFound();
        var customer = await repository.GetByIdAsync(job.CustomerId, ct);
        return Ok(new
        {
            Job = job with { CustomerName = customer?.Name ?? job.CustomerName },
            Phone = customer?.Phone,
            Address = customer?.Address
        });
    }

    [HttpGet]
    [ProducesResponseType<IReadOnlyList<CustomerJobResponse>>(StatusCodes.Status200OK)]
    public async Task<ActionResult<IReadOnlyList<CustomerJobResponse>>> GetAll(
        CancellationToken cancellationToken,
        [FromServices] IServiceProvider services)
    {
        if (User.IsInRole(UserRoles.Employee))
        {
            var userId = Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
            return Ok(await services.GetRequiredService<IJobAccessRepository>()
                .GetEmployeeJobsAsync(userId, cancellationToken));
        }
        var customers = await repository.GetAllAsync(cancellationToken);
        var customerNames = customers.ToDictionary(customer => customer.Id, customer => customer.Name);
        var jobs = await repository.GetAllJobsAsync(cancellationToken);

        return Ok(jobs.Select(job => job with
        {
            CustomerName = customerNames.GetValueOrDefault(job.CustomerId)
        }));
    }

    [HttpPut("{id:guid}")]
    [Authorize(Policy = AuthorizationPolicies.Management)]
    [ProducesResponseType<CustomerJobResponse>(StatusCodes.Status200OK)]
    [ProducesResponseType<ValidationProblemDetails>(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<ActionResult<CustomerJobResponse>> Update(
        Guid id,
        UpdateCustomerJobRequest request,
        CancellationToken cancellationToken)
    {
        var job = await repository.UpdateJobAsync(id, request, cancellationToken);
        return job is null ? NotFound() : Ok(job);
    }

    [HttpDelete("{id:guid}")]
    [Authorize(Policy = AuthorizationPolicies.Management)]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> Delete(Guid id, CancellationToken cancellationToken)
    {
        try
        {
            return await repository.DeleteJobAsync(id, cancellationToken) ? NoContent() : NotFound();
        }
        catch (HttpRequestException e) when (e.StatusCode == System.Net.HttpStatusCode.Conflict)
        {
            return Problem(statusCode: 409, detail: "这项工作仍有关联资料（例如工作照片或 PO PDF），不能删除。请保留工作记录或联系管理员处理。");
        }
    }
}
