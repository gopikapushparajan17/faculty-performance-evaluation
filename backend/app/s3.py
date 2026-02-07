import uuid
from pathlib import Path

from app.config import (
    S3_BUCKET,
    S3_PREFIX,
    AWS_REGION,
    AWS_ACCESS_KEY_ID,
    AWS_SECRET_ACCESS_KEY,
    S3_ENDPOINT_URL,
    S3_USE_PATH_STYLE,
)


def _client():
    if not S3_BUCKET:
        return None
    import boto3
    from botocore.config import Config
    kwargs = {"region_name": AWS_REGION}
    if AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY:
        kwargs["aws_access_key_id"] = AWS_ACCESS_KEY_ID
        kwargs["aws_secret_access_key"] = AWS_SECRET_ACCESS_KEY
    if S3_ENDPOINT_URL:
        kwargs["endpoint_url"] = S3_ENDPOINT_URL
    config = Config(s3={"addressing_style": "path"}) if S3_USE_PATH_STYLE else None
    return boto3.client("s3", config=config, **kwargs)


def upload_file(file_content: bytes, filename: str, content_type: str, prefix: str = "") -> str:
    """Upload file to S3. Returns public URL or s3 key. prefix e.g. evaluation_id/module_name/0"""
    client = _client()
    if not client:
        raise RuntimeError("S3 not configured: set S3_BUCKET and AWS credentials")

    ext = Path(filename).suffix or ".bin"
    key = f"{S3_PREFIX}/{prefix}/{uuid.uuid4().hex}{ext}".strip("/")
    client.put_object(
        Bucket=S3_BUCKET,
        Key=key,
        Body=file_content,
        ContentType=content_type or "application/octet-stream",
    )
    if S3_ENDPOINT_URL:
        return f"{S3_ENDPOINT_URL}/{S3_BUCKET}/{key}"
    return f"https://{S3_BUCKET}.s3.{AWS_REGION}.amazonaws.com/{key}"
