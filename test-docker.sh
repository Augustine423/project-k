#!/bin/bash
echo "Testing KZYS Docker setup..."

# Test 1: Backend Docker build
echo "1. Building backend Docker image..."
cd backend
docker build -t kzys-backend-test . > /dev/null 2>&1
if [ $? -eq 0 ]; then
    echo "   ✅ Backend Docker build successful"
else
    echo "   ❌ Backend Docker build failed"
    exit 1
fi

# Test 2: Frontend Docker build  
echo "2. Building frontend Docker image..."
cd ../frontend
docker build -t kzys-frontend-test . > /dev/null 2>&1
if [ $? -eq 0 ]; then
    echo "   ✅ Frontend Docker build successful"
else
    echo "   ❌ Frontend Docker build failed"
    exit 1
fi

# Test 3: Backend compilation
echo "3. Testing backend compilation..."
cd ../backend
make clean > /dev/null 2>&1
make > /dev/null 2>&1
if [ -f "websocket-server" ] && [ -f "media-router" ] && [ -f "videoroom-core" ]; then
    echo "   ✅ Backend binaries compiled"
else
    echo "   ❌ Backend compilation failed"
    exit 1
fi

# Test 4: Frontend files exist
echo "4. Checking frontend files..."
cd ../frontend
if [ -f "test-frontend.html" ] && [ -f "webrtc-integration.js" ]; then
    echo "   ✅ Frontend files exist"
else
    echo "   ❌ Frontend files missing"
    exit 1
fi

# Test 5: Docker Compose file
echo "5. Checking docker-compose.yml..."
cd ..
if [ -f "docker-compose.yml" ]; then
    echo "   ✅ docker-compose.yml exists"
    
    # Check structure
    if grep -q "backend:" docker-compose.yml && grep -q "frontend:" docker-compose.yml; then
        echo "   ✅ docker-compose.yml structure correct"
    else
        echo "   ❌ docker-compose.yml structure incorrect"
    fi
else
    echo "   ❌ docker-compose.yml missing"
    exit 1
fi

echo ""
echo "✅ All tests passed! Docker setup is correct."
echo ""
echo "To run:"
echo "  docker-compose up --build"
echo ""
echo "Access:"
echo "  Frontend: http://localhost"
echo "  WebSocket: ws://localhost:8080"
