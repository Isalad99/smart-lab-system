import os
from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from dotenv import load_dotenv

load_dotenv()

SQLALCHEMY_DATABASE_URL = os.getenv("SQLALCHEMY_DATABASE_URL")

if not SQLALCHEMY_DATABASE_URL:
    raise ValueError("Database URL is missing. Check your .env file.")

# Keep the single API worker's connection footprint small and recover cleanly
# when an idle Supabase connection has been recycled.
engine_options = {
    "pool_pre_ping": True,
    "pool_recycle": 1800,
}
if SQLALCHEMY_DATABASE_URL.startswith("postgresql"):
    engine_options.update(pool_size=3, max_overflow=2)

engine = create_engine(SQLALCHEMY_DATABASE_URL, **engine_options)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
