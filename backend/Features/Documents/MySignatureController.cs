using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using ShengHengAircon.Api.Features.Auth;

namespace ShengHengAircon.Api.Features.Documents;

[ApiController, Route("api/documents/my-signature"), Authorize(Policy = AuthorizationPolicies.Owner)]
[ResponseCache(NoStore = true, Location = ResponseCacheLocation.None)]
public sealed class MySignatureController : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> Get([FromServices] IDocumentStore profiles,
        [FromServices] ISavedSignatureStore signatures, CancellationToken ct)
    {
        var userId = Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
        if (!await profiles.IsOwnerAsync(userId, ct)) return Forbid();
        try { return Ok(new SavedSignatureContext(await signatures.GetSavedSignatureAsync(userId, ct))); }
        catch (DocumentException e) { return Problem(statusCode: e.StatusCode, detail: e.Message); }
        catch (HttpRequestException) { return Problem(statusCode: 502, detail: "常用签名载入失败，请稍后重试。"); }
    }

    [HttpPut, RequestSizeLimit(1048576)]
    public async Task<IActionResult> Save(SaveMySignatureRequest request, [FromServices] IDocumentStore profiles,
        [FromServices] ISavedSignatureStore signatures, CancellationToken ct)
    {
        var userId = Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
        if (!await profiles.IsOwnerAsync(userId, ct)) return Forbid();
        try { return Ok(await signatures.SaveMySignatureAsync(userId, request, ct)); }
        catch (DocumentException e) { return Problem(statusCode: e.StatusCode, detail: e.Message); }
        catch (HttpRequestException) { return Problem(statusCode: 502, detail: "常用签名保存结果未确认，请重新载入常用签名后检查。"); }
    }
}
