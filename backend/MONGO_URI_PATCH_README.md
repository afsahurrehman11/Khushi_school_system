# MongoDB URI Patch Automation

This utility automatically detects and fixes MongoDB URI encoding issues that cause `pymongo.errors.InvalidURI: Username and password must be escaped according to RFC 3986` errors.

## How It Works

1. **Detection**: When a MongoDB connection fails with the specific RFC 3986 error, the system automatically attempts to patch the URI.

2. **Parsing**: The URI is parsed to extract the username and password components.

3. **Encoding Check**: Each component is checked for special characters that need URL encoding.

4. **Encoding**: Special characters are encoded using `urllib.parse.quote_plus()`.

5. **Reconstruction**: A new URI is built with the properly encoded credentials.

6. **Testing**: The patched URI is tested to ensure it works.

## Usage

The utility is automatically integrated into the database connection code. When you start the backend, it will:

- Try to connect with the original URI
- If it fails with the RFC 3986 error, automatically patch and retry
- Log success when patching works

## Manual Usage

```python
from app.utils.mongo_uri_patch import patch_mongo_uri, auto_patch_and_test

# Patch a URI manually
original_uri = "mongodb://user@domain.com:pass!word@host:27017/db"
patched_uri = patch_mongo_uri(original_uri)
# Result: "mongodb://user%40domain.com:pass%21word@host:27017/db"

# Auto-patch and test connection
final_uri, success = auto_patch_and_test(original_uri)
if success:
    print("✅ Connection successful with patched URI")
```

## What Gets Encoded

The following characters in usernames/passwords are automatically encoded:
- `@` → `%40`
- `!` → `%21`
- `#` → `%23`
- `%` → `%25`
- `&` → `%26`
- `+` → `%2B`
- And all other non-alphanumeric characters except `-`, `.`, `_`, `~`

## Security

- Raw passwords are never logged
- Only encoded versions appear in logs
- The utility only activates when the specific RFC 3986 error is detected

## Testing

Run the test script to verify functionality:

```bash
cd backend
python test_mongo_uri_patch.py
```

This will test all components of the URI patching system.