
from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path


# Fallback configuration if .env is not configured
DEFAULT_API_BASE_URL = "http://127.0.0.1:8000"
DEFAULT_MAIN_CURRENCY = "usd"

ENV_PATH = Path(__file__).resolve().parent / ".env"


@dataclass
class CliConfig:
	api_base_url: str = DEFAULT_API_BASE_URL
	main_currency: str = DEFAULT_MAIN_CURRENCY


def load_config() -> CliConfig:
	data: dict[str, str] = {}

	if ENV_PATH.exists():
		for raw_line in ENV_PATH.read_text(encoding="utf-8").splitlines():
			line = raw_line.strip()
			if not line or line.startswith("#"):
				continue
			if "=" not in line:
				continue
			key, value = line.split("=", 1)
			data[key.strip()] = value.strip()

	api_base_url = data.get("API_BASE_URL", DEFAULT_API_BASE_URL)
	main_currency = data.get("MAIN_CURRENCY", DEFAULT_MAIN_CURRENCY).lower()

	return CliConfig(
		api_base_url=api_base_url,
		main_currency=main_currency,
	)


def save_config(config: CliConfig) -> None:
	contents = [
		"# Financial Tracker CLI Configuration",
		"",
		f"API_BASE_URL={config.api_base_url}",
		f"MAIN_CURRENCY={config.main_currency.lower()}",
		"",
	]

	ENV_PATH.write_text("\n".join(contents), encoding="utf-8")