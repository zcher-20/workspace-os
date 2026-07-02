from enum import Enum
from pathlib import Path

import yaml


class ActionLevel(Enum):
    ALLOWED = "allowed"
    APPROVAL_REQUIRED = "approval_required"
    FORBIDDEN = "forbidden"
    UNKNOWN = "unknown"


class PermissionManager:
    def __init__(self, permissions_path: Path):
        with open(permissions_path) as f:
            self._config = yaml.safe_load(f)

        self._allowed = {a["action"] for a in self._config.get("allowed", [])}
        self._approval = {a["action"]: a for a in self._config.get("approval_required", [])}
        self._forbidden = {a["action"]: a for a in self._config.get("forbidden", [])}

    def check(self, action: str) -> ActionLevel:
        if action in self._allowed:
            return ActionLevel.ALLOWED
        if action in self._approval:
            return ActionLevel.APPROVAL_REQUIRED
        if action in self._forbidden:
            return ActionLevel.FORBIDDEN
        return ActionLevel.UNKNOWN

    def get_approval_message(self, action: str) -> str:
        entry = self._approval.get(action, {})
        return entry.get("approval_message", "This action requires human approval.")

    def get_forbidden_reason(self, action: str) -> str:
        entry = self._forbidden.get(action, {})
        return entry.get("reason", "This action is not permitted.")

    def request_approval(self, action: str) -> bool:
        message = self.get_approval_message(action)
        print(f"\n⚠️  APPROVAL REQUIRED: {message}")
        response = input("Approve? (yes/no): ").strip().lower()
        return response in ("yes", "y")

    def enforce(self, action: str) -> bool:
        level = self.check(action)
        if level == ActionLevel.ALLOWED:
            return True
        if level == ActionLevel.APPROVAL_REQUIRED:
            return self.request_approval(action)
        if level == ActionLevel.FORBIDDEN:
            reason = self.get_forbidden_reason(action)
            print(f"\n🚫 FORBIDDEN: {action} - {reason}")
            return False
        print(f"\n❓ UNKNOWN ACTION: {action} - not listed in permissions. Denying by default.")
        return False
