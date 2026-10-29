using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using ShengHengAircon.Api.Features.Auth;

namespace ShengHengAircon.Api.Features.Quotes;

[ApiController, Route("api/quotes"), Authorize(Policy = AuthorizationPolicies.Management)]
public sealed class QuotesController(IQuoteRepository repository) : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> GetAll(CancellationToken ct) => Ok(await repository.GetAllAsync(ct));
    [HttpGet("{id:guid}")]
    public async Task<IActionResult> Get(Guid id, CancellationToken ct)
    {
        var quote = await repository.GetAsync(id, ct);
        return quote is null ? NotFound() : Ok(quote);
    }
    [HttpPost]
    public Task<IActionResult> Create(QuoteInput input, CancellationToken ct) => Save(null, input, ct);
    [HttpPatch("{id:guid}/status")]
    public async Task<IActionResult> UpdateStatus(Guid id, UpdateQuoteStatusRequest input, CancellationToken ct)
    {
        var quote = await repository.UpdateStatusAsync(id, input.Status, ct);
        return quote is null ? NotFound() : Ok(quote);
    }
    [HttpPut("{id:guid}")]
    public Task<IActionResult> Update(Guid id, QuoteInput input, CancellationToken ct) => Save(id, input, ct);
    [HttpPost("{id:guid}/invoice")]
    public async Task<IActionResult> ConvertToInvoice(Guid id, ConvertQuoteToInvoiceRequest input, CancellationToken ct)
    {
        try
        {
            var invoiceId = await repository.ConvertToInvoiceAsync(id, input, ct);
            return invoiceId is null ? NotFound() : Created($"/api/invoices/{invoiceId}", new QuoteConversionResponse(invoiceId.Value));
        }
        catch (QuoteWriteException exception) { return Problem(statusCode: exception.StatusCode, detail: exception.Message); }
    }
    [HttpPost("{id:guid}/job")]
    public async Task<IActionResult> ConvertToJob(Guid id, ConvertQuoteToJobRequest input, CancellationToken ct)
    {
        try
        {
            var jobId = await repository.ConvertToJobAsync(id, input, ct);
            return jobId is null ? NotFound() : Created($"/api/jobs/{jobId}", new QuoteConversionResponse(jobId.Value));
        }
        catch (QuoteWriteException exception) { return Problem(statusCode: exception.StatusCode, detail: exception.Message); }
    }
    private async Task<IActionResult> Save(Guid? id, QuoteInput input, CancellationToken ct)
    {
        try
        {
            var quote = await repository.SaveAsync(id, input, ct);
            if (quote is null) return NotFound();
            return id is null ? CreatedAtAction(nameof(Get), new { id = quote.Id }, quote) : Ok(quote);
        }
        catch (QuoteWriteException exception)
        {
            return Problem(statusCode: exception.StatusCode, detail: exception.Message);
        }
    }
}
