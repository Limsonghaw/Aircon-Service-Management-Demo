using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using ShengHengAircon.Api.Features.Auth;

namespace ShengHengAircon.Api.Features.Invoices;

[ApiController]
[Route("api/invoices")]
[Authorize(Policy = AuthorizationPolicies.Management)]
public sealed class InvoicesController(IInvoiceRepository repository) : ControllerBase
{
    [HttpGet]
    [ProducesResponseType<IReadOnlyList<InvoiceResponse>>(StatusCodes.Status200OK)]
    public async Task<ActionResult<IReadOnlyList<InvoiceResponse>>> GetAll(CancellationToken cancellationToken) =>
        Ok(await repository.GetAllAsync(cancellationToken));

    [HttpGet("{id:guid}")]
    [ProducesResponseType<InvoiceResponse>(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<ActionResult<InvoiceResponse>> GetById(Guid id, CancellationToken cancellationToken)
    {
        var invoice = await repository.GetByIdAsync(id, cancellationToken);
        return invoice is null ? NotFound() : Ok(invoice);
    }

    [HttpPost]
    [ProducesResponseType<InvoiceResponse>(StatusCodes.Status201Created)]
    [ProducesResponseType<ValidationProblemDetails>(StatusCodes.Status400BadRequest)]
    public async Task<ActionResult<InvoiceResponse>> Create(
        CreateInvoiceRequest request,
        CancellationToken cancellationToken)
    {
        var invoice = await repository.CreateAsync(request, cancellationToken);
        return CreatedAtAction(nameof(GetById), new { id = invoice.Id }, invoice);
    }

    [HttpPut("{id:guid}")]
    [ProducesResponseType<InvoiceResponse>(StatusCodes.Status200OK)]
    [ProducesResponseType<ValidationProblemDetails>(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<ActionResult<InvoiceResponse>> Update(
        Guid id,
        UpdateInvoiceRequest request,
        CancellationToken cancellationToken)
    {
        var invoice = await repository.UpdateAsync(id, request, cancellationToken);
        return invoice is null ? NotFound() : Ok(invoice);
    }
}
