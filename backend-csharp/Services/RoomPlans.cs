namespace Kzys.Backend.Services;

/// <summary>
/// Public plan catalog API — pricing and tier IDs for monetization enforcement.
/// </summary>
public static class RoomPlans
{
    public const string Free = RoomPlanManager.Free;
    public const string Plus100 = RoomPlanManager.Plus100;
    public const string Plus500 = RoomPlanManager.Plus500;
    public const string Plus1000 = RoomPlanManager.Plus1000;
    public const string Plus2000 = RoomPlanManager.Plus2000;

    public static IReadOnlyList<Models.RoomPlan> All(RoomPlanManager manager) =>
        manager.GetAllPlans();
}
