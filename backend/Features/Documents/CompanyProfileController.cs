using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Options;
using ShengHengAircon.Api.Features.Auth;
using ShengHengAircon.Api.Options;

namespace ShengHengAircon.Api.Features.Documents;

[ApiController]
[Route("api/company-profile")]
[Authorize(Policy = AuthorizationPolicies.Management)]
public sealed class CompanyProfileController(
    IOptions<CompanyProfileOptions> options) : ControllerBase
{
    [HttpGet]
    public IActionResult Get()
    {
        var profile = options.Value;

        return Ok(new
        {
            profile.ChineseName,
            profile.EnglishName,
            profile.RegistrationNumber,
            profile.AddressLine1,
            profile.AddressLine2,
            profile.Phone,
            profile.Mobile,
            profile.ChineseDescription,
            profile.EnglishDescription,
            profile.RepresentativeName
        });
    }
}