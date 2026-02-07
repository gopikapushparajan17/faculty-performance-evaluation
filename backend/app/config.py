import os

SECRET_KEY = os.environ.get("SECRET_KEY", "dev-secret-change-in-production")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24

# S3 (proof uploads)
AWS_ACCESS_KEY_ID = os.environ.get("AWS_ACCESS_KEY_ID", "")
AWS_SECRET_ACCESS_KEY = os.environ.get("AWS_SECRET_ACCESS_KEY", "")
AWS_REGION = os.environ.get("AWS_REGION", "us-east-1")
S3_BUCKET = os.environ.get("S3_BUCKET", "")
S3_PREFIX = os.environ.get("S3_PREFIX", "evaluation-proofs")
S3_USE_PATH_STYLE = os.environ.get("S3_USE_PATH_STYLE", "").lower() in ("1", "true")
S3_ENDPOINT_URL = os.environ.get("S3_ENDPOINT_URL") or None
