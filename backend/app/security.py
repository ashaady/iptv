import base64
import hashlib
from pathlib import Path

from cryptography.fernet import Fernet, InvalidToken

from .config import get_settings


class CredentialCipher:
    def __init__(self) -> None:
        settings = get_settings()
        if settings.secret_key:
            digest = hashlib.sha256(settings.secret_key.encode("utf-8")).digest()
            key = base64.urlsafe_b64encode(digest)
        else:
            key_path = Path(settings.secret_key_path)
            key_path.parent.mkdir(parents=True, exist_ok=True)
            if key_path.exists():
                key = key_path.read_bytes().strip()
            else:
                key = Fernet.generate_key()
                key_path.write_bytes(key)
        self._fernet = Fernet(key)

    def encrypt(self, value: str) -> str:
        return self._fernet.encrypt(value.encode("utf-8")).decode("ascii")

    def decrypt(self, value: str) -> str:
        try:
            return self._fernet.decrypt(value.encode("ascii")).decode("utf-8")
        except InvalidToken as exc:
            raise RuntimeError("Impossible de déchiffrer les identifiants IPTV.") from exc


cipher = CredentialCipher()
