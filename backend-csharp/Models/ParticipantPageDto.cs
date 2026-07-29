namespace Kzys.Backend.Models;

public sealed class ParticipantsPageDto
{
    public required List<ParticipantRecord> Items { get; init; }
    public int Total { get; init; }
    public int Offset { get; init; }
    public int Limit { get; init; }
    public bool HasMore { get; init; }
}
