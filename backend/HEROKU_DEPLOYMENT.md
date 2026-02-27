# Heroku Deployment Guide for CMS Backend

## ⚠️ CRITICAL: Resource Constraints

Heroku Free/Eco dynos have severe limitations for ML workloads:
- **RAM**: 512MB (Standard) / 1GB (Performance)
- **Slug Size**: 500MB compressed maximum
- **Boot Timeout**: 60 seconds to bind port
- **No GPU**: All inference runs on CPU

## 🔴 Current Problem

The standard `requirements.txt` includes:
- `torch` (~800MB-1.2GB)
- `tensorflow` (~500MB-700MB) 
- `deepface` (pulls TensorFlow)
- `facenet-pytorch` (~50MB + models)

**Total: ~2GB+ (exceeds 500MB limit)**

## ✅ Solution: Use Optimized Requirements

### Step 1: Switch to Heroku Requirements

```bash
# On Heroku, rename/copy the optimized requirements
cp requirements-heroku.txt requirements.txt
```

Or configure Heroku to use specific requirements:
```bash
heroku config:set PIP_REQUIREMENTS_FILE=requirements-heroku.txt
```

### Step 2: Use Lite Embedding Service

For Heroku, the system will automatically fall back to the lightweight
embedding service when DeepFace is not available.

If you want to force lite mode:
```bash
heroku config:set USE_LITE_EMBEDDINGS=true
```

### Step 3: Configure Memory Settings

```bash
# Reduce worker memory footprint
heroku config:set WEB_CONCURRENCY=1
heroku config:set PYTHONUNBUFFERED=1

# Enable lazy model loading (already implemented)
heroku config:set LAZY_LOAD_ML=true
```

## 📊 Expected Resource Usage (After Optimization)

| Component | Full Mode | Lite Mode (Heroku) |
|-----------|-----------|-------------------|
| Slug Size | ~2GB ❌ | ~350MB ✅ |
| RAM (idle) | ~800MB ❌ | ~300MB ✅ |
| RAM (inference) | ~1.5GB ❌ | ~500MB ⚠️ |
| Boot Time | 3-5 min ❌ | 30-60s ✅ |

## 🏗️ Architecture Options

### Option 1: Single Dyno (Current - Limited)
```
[Heroku Dyno] ──▶ All features + AI
                 ⚠️ Resource constrained
```

### Option 2: Separate AI Service (Recommended)
```
[Heroku Dyno] ──▶ Core CMS features
       │
       └──▶ [External AI API] ──▶ Face recognition
            (Railway/Render/HuggingFace)
```

### Option 3: Disable Face Recognition
```
# Completely disable face recognition feature
heroku config:set FACE_RECOGNITION_ENABLED=false
```

## 🔧 Heroku Buildpack Configuration

The `.buildpacks` file is configured to use:
```
https://github.com/heroku/heroku-buildpack-python.git#v244.2.0
```

For CPU-only PyTorch, you may need:
```bash
heroku buildpacks:add --index 1 https://github.com/heroku/heroku-buildpack-apt
```

Create `Aptfile` if needed:
```
libgl1-mesa-glx
libglib2.0-0
```

## 🚨 Troubleshooting

### Error: Slug size too large
```bash
# Check slug size
heroku plugins:install heroku-slugs
heroku slugs:stats

# Use optimized requirements
cp requirements-heroku.txt requirements.txt
git add . && git commit -m "Use Heroku requirements"
git push heroku main
```

### Error: R14 Memory Quota Exceeded
```bash
# Reduce concurrent workers
heroku config:set WEB_CONCURRENCY=1

# Enable memory monitoring
heroku logs --tail | grep -i memory
```

### Error: Boot Timeout (H20)
The backend already implements lazy model loading:
- Server binds to port immediately
- ML models load in background
- Face recognition endpoints return "loading" until ready

### Error: Model Download Fails
Models are downloaded on first use. For Heroku:
```bash
# Pre-download models during build (add to build.sh)
python -c "from facenet_pytorch import InceptionResnetV1; InceptionResnetV1(pretrained='vggface2')"
```

## 📋 Pre-Deployment Checklist

- [ ] Using `requirements-heroku.txt` or equivalent
- [ ] `WEB_CONCURRENCY=1` is set
- [ ] Face recognition disabled OR using lite mode
- [ ] Tested locally with `FACE_RECOGNITION_ENABLED=false`
- [ ] Verified slug size < 500MB
- [ ] MongoDB Atlas connection string configured
- [ ] All secrets in Heroku config vars

## 🔄 Migration Path

If face recognition is critical:

1. **Short-term**: Use lite mode on Heroku (FaceNet only)
2. **Medium-term**: Deploy AI to Railway/Render with GPU
3. **Long-term**: Use managed AI API (AWS Rekognition, Azure Face)

## 📞 Support

For deployment issues:
1. Check Heroku logs: `heroku logs --tail`
2. Verify config: `heroku config`
3. Test locally: `uvicorn app.main:app --host 0.0.0.0 --port 8000`
