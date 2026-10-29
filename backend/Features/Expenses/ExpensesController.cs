using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using ShengHengAircon.Api.Features.Auth;

namespace ShengHengAircon.Api.Features.Expenses;

[ApiController, Route("api/expenses"), Authorize(Policy = AuthorizationPolicies.Management)]
public sealed class ExpensesController(IExpenseRepository repository) : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> GetAll(CancellationToken cancellationToken) =>
        Ok(await repository.GetAllAsync(cancellationToken));

    [HttpGet("{id:guid}")]
    public async Task<IActionResult> Get(Guid id, CancellationToken cancellationToken)
    {
        var expense = await repository.GetAsync(id, cancellationToken);
        return expense is null ? NotFound() : Ok(expense);
    }

    [HttpPost]
    public Task<IActionResult> Create(ExpenseInput input, CancellationToken cancellationToken) =>
        Save(null, input, cancellationToken);

    [HttpPut("{id:guid}")]
    public Task<IActionResult> Update(Guid id, ExpenseInput input, CancellationToken cancellationToken) =>
        Save(id, input, cancellationToken);

    private async Task<IActionResult> Save(Guid? id, ExpenseInput input, CancellationToken cancellationToken)
    {
        try
        {
            if (id is null)
            {
                var created = await repository.CreateAsync(input, cancellationToken);
                return CreatedAtAction(nameof(Get), new { id = created.Id }, created);
            }

            var updated = await repository.UpdateAsync(id.Value, input, cancellationToken);
            return updated is null ? NotFound() : Ok(updated);
        }
        catch (ExpenseWriteException exception)
        {
            return Problem(statusCode: exception.StatusCode, detail: exception.Message);
        }
    }
}
