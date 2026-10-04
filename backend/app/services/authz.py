"""
Authorization Context and Permission Evaluation

Defines the `AuthContext` class and factory function `build_auth_context`.
Encapsulates user identity, assigned teams, and team lead memberships to perform
server-side resource-level authorization checks without repeated database round-trips.
"""

from app.models import MembershipRole, User
from app.repositories import TeamRepository


class AuthContext:
    """Request-scoped authorization context representing the acting user's privileges.

    Attributes:
        user: SQLAlchemy User model instance of the authenticated actor.
        team_ids: List of team IDs of which the user is a member or lead.
        lead_team_ids: List of team IDs of which the user specifically holds the TEAM_LEAD role.
    """

    def __init__(self, user: User, team_ids: list[int], lead_team_ids: list[int]) -> None:
        self.user = user
        self.team_ids = team_ids
        self.lead_team_ids = lead_team_ids

    @property
    def is_admin(self) -> bool:
        """Check if the user has global system administrator privileges."""
        return self.user.is_admin

    def can_view_team(self, team_id: int) -> bool:
        """Evaluate if the user is authorized to read items, activity, and comments for a team.

        Admins can view any team. Regular members can only view teams they belong to.
        """
        return self.is_admin or team_id in self.team_ids

    def is_member_of(self, team_id: int) -> bool:
        """Check if the user is associated with the given team."""
        return self.is_admin or team_id in self.team_ids

    def is_lead_of(self, team_id: int) -> bool:
        """Check if the user is a Team Lead of the specified team (or a global admin).

        Required for operations such as reassignment, priority changes, cross-team moves,
        and approving state transitions to RESOLVED.
        """
        return self.is_admin or team_id in self.lead_team_ids

    def visible_team_ids(self) -> list[int] | None:
        """Return the list of team IDs that this user is permitted to query.

        Returns:
            list[int] | None: None for global admins (unconstrained query), or a list of team IDs for members.
        """
        if self.is_admin:
            return None
        return self.team_ids


def build_auth_context(user: User, teams: TeamRepository) -> AuthContext:
    """Construct an `AuthContext` by querying the user's active team memberships.

    Args:
        user: The authenticated User model.
        teams: TeamRepository instance for database queries.

    Returns:
        AuthContext: Fully populated authorization context for the current request.
    """
    memberships = teams.memberships_for_user(user.id)
    team_ids = [m.team_id for m in memberships]
    lead_team_ids = [m.team_id for m in memberships if m.role == MembershipRole.TEAM_LEAD.value]
    return AuthContext(user, team_ids, lead_team_ids)

