using System.ComponentModel.DataAnnotations;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using ShengHengAircon.Api.Features.Auth;

namespace ShengHengAircon.Api.Features.ActivityLogs;

[ApiController, Route("api/activity-logs"), Authorize(Policy = AuthorizationPolicies.Management)]
public sealed class ActivityLogsController(IActivityLogRepository repository) : ControllerBase
{
    [HttpGet("page")]
    public async Task<IActionResult> GetPage([FromQuery] ActivityLogQuery query, CancellationToken ct)
    {
        if (query.From > query.To) return BadRequest(new { detail = "开始日期不能晚于结束日期。" });
        return Ok(await repository.GetPageAsync(query, ct));
    }

    [HttpGet]
    [ProducesResponseType<IReadOnlyList<ActivityLogResponse>>(StatusCodes.Status200OK)]
    public async Task<ActionResult<IReadOnlyList<ActivityLogResponse>>> GetRecent(
        [FromQuery, Range(1, 200)] int limit = 100,
        CancellationToken cancellationToken = default) =>
        Ok(await repository.GetRecentAsync(limit, cancellationToken));
}
