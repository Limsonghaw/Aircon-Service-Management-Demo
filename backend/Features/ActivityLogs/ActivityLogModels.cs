namespace ShengHengAircon.Api.Features.ActivityLogs;

public sealed record ActivityLogResponse(
    long Id,
    string Action,
    string EntityType,
    Guid EntityId,
    string EntityLabel,
    Guid? ActorUserId,
    string ActorName,
    string? PreviousStatus,
    string? NewStatus,
    DateTimeOffset CreatedAt);

public interface IActivityLogRepository
{
    Task<IReadOnlyList<ActivityLogResponse>> GetRecentAsync(int limit, CancellationToken cancellationToken);
    Task<ActivityLogPageResponse> GetPageAsync(ActivityLogQuery query, CancellationToken cancellationToken);
}

public sealed class ActivityLogQuery
{
    [System.ComponentModel.DataAnnotations.Range(1, 100000)] public int Page { get; set; } = 1;
    [System.ComponentModel.DataAnnotations.Range(1, 100)] public int PageSize { get; set; } = 20;
    [System.ComponentModel.DataAnnotations.MaxLength(100)] public string? Search { get; set; }
    [System.ComponentModel.DataAnnotations.RegularExpression("^(created|updated|status_changed|quote_converted|document_signed|receipt_uploaded|job_photo_uploaded)$")]
    public string? Action { get; set; }
    [System.ComponentModel.DataAnnotations.RegularExpression("^(customer|job|invoice|quote|expense|team|employee|owner_signature)$")]
    public string? EntityType { get; set; }
    public DateOnly? From { get; set; }
    public DateOnly? To { get; set; }
}
public sealed record ActivityLogPageResponse(IReadOnlyList<ActivityLogResponse> Items, long Total, int Page, int PageSize);
