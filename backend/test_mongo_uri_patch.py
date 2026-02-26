#!/usr/bin/env python3
"""
Test script for MongoDB URI patching utility
"""

import sys
import os
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.utils.mongo_uri_patch import (
    parse_mongo_uri,
    needs_encoding,
    encode_mongo_credentials,
    reconstruct_mongo_uri,
    patch_mongo_uri,
    test_mongo_connection,
    auto_patch_and_test
)


def test_uri_parsing():
    """Test URI parsing functionality"""
    print("Testing URI parsing...")

    # Test URI with credentials
    uri = "mongodb://user@domain.com:pass@host:27017/db"
    username, password, base_uri = parse_mongo_uri(uri)
    assert username == "user@domain.com", f"Expected 'user@domain.com', got '{username}'"
    assert password == "pass", f"Expected 'pass', got '{password}'"
    assert base_uri == "mongodb://host:27017/db", f"Expected 'mongodb://host:27017/db', got '{base_uri}'"
    print("✅ URI parsing test passed")


def test_encoding_detection():
    """Test encoding detection"""
    print("Testing encoding detection...")

    assert needs_encoding("simpleuser") == False, "Simple username should not need encoding"
    assert needs_encoding("user@domain.com") == True, "@ should need encoding"
    assert needs_encoding("user!pass") == True, "! should need encoding"
    assert needs_encoding("user#pass") == True, "# should need encoding"
    print("✅ Encoding detection test passed")


def test_credential_encoding():
    """Test credential encoding"""
    print("Testing credential encoding...")

    username, password = encode_mongo_credentials("user@domain.com", "pass!word#123")
    assert username == "user%40domain.com", f"Expected 'user%40domain.com', got '{username}'"
    assert password == "pass%21word%23123", f"Expected 'pass%21word%23123', got '{password}'"
    print("✅ Credential encoding test passed")


def test_uri_reconstruction():
    """Test URI reconstruction"""
    print("Testing URI reconstruction...")

    base_uri = "mongodb://host:27017/db"
    reconstructed = reconstruct_mongo_uri(base_uri, "user%40domain.com", "pass%21word")
    expected = "mongodb://user%40domain.com:pass%21word@host:27017/db"
    assert reconstructed == expected, f"Expected '{expected}', got '{reconstructed}'"
    print("✅ URI reconstruction test passed")


def test_full_patch():
    """Test full URI patching"""
    print("Testing full URI patching...")

    # URI with special characters
    original_uri = "mongodb://user@domain.com:pass!word@host:27017/db"
    patched_uri = patch_mongo_uri(original_uri)
    expected = "mongodb://user%40domain.com:pass%21word@host:27017/db"

    assert patched_uri == expected, f"Expected '{expected}', got '{patched_uri}'"
    print("✅ Full URI patching test passed")


def test_no_patch_needed():
    """Test when no patching is needed"""
    print("Testing when no patching is needed...")

    # URI without special characters
    original_uri = "mongodb://simpleuser:simplepass@host:27017/db"
    patched_uri = patch_mongo_uri(original_uri)

    # Should return original URI unchanged
    assert patched_uri == original_uri, f"Expected no change, but got '{patched_uri}'"
    print("✅ No patching needed test passed")


if __name__ == "__main__":
    print("Running MongoDB URI patching tests...\n")

    try:
        test_uri_parsing()
        test_encoding_detection()
        test_credential_encoding()
        test_uri_reconstruction()
        test_full_patch()
        test_no_patch_needed()

        print("\n🎉 All tests passed! MongoDB URI patching utility is working correctly.")

    except Exception as e:
        print(f"\n❌ Test failed: {e}")
        sys.exit(1)