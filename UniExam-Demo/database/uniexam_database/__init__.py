"""Versioned database resources shared by the API and administration commands."""
from importlib.resources import files


def schema_sql() -> str:
    return files(__package__).joinpath("schema.sql").read_text(encoding="utf-8")


def migration_path() -> str:
    return str(files(__package__).joinpath("migrations"))
