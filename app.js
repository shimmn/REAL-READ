const viewport = document.getElementById('viewport');
const textFlow = document.getElementById('text-flow');
const readerContainer = document.getElementById('reader-container');
const widthTooltip = document.getElementById('width-tooltip');

const prev3Btn = document.getElementById('prev-3-btn');
const prev1Btn = document.getElementById('prev-1-btn');
const next1Btn = document.getElementById('next-1-btn');
const next3Btn = document.getElementById('next-3-btn');

const progressCounter = document.getElementById('progress-counter');
const customTextInput = document.getElementById('custom-text');
const applyBtn = document.getElementById('apply-btn');
const pasteBtn = document.getElementById('paste-btn');
const toggleInputBtn = document.getElementById('toggle-input-btn');
const installAppBtn = document.getElementById('install-app-btn');

const shuttleTrack = document.getElementById('shuttle-track');
const shuttleThumb = document.getElementById('shuttle-thumb');

const handleLeft = document.getElementById('handle-left');
const handleRight = document.getElementById('handle-right');

let currentContainerWidth = 760;
let allLines = [];
let lineElements = [];
let currentLineIdx = 0;

let currentY = 0;
let velocityY = 0;
const friction = 0.92;
const MAX_SHUTTLE_SPEED = 26;

let isShuttleDragging = false;
let shuttleOffset = 0;
let shuttlePixelOffset = 0;
let isCoastingToStop = false;

function triggerHaptic(duration = 10) {
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
        try { navigator.vibrate(duration); } catch (e) {}
    }
}

function isImageIndex(idx) {
    return lineElements[idx] && lineElements[idx].classList.contains('image-line');
}

function fixBrokenLineBreaks(rawText) {
    if (!rawText) return [];

    const normalized = rawText.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    const rawParagraphs = normalized.split('\n');
    const mergedParagraphs = [];
    let buffer = "";

    rawParagraphs.forEach(line => {
        const trimmed = line.trim();
        if (!trimmed) {
            if (buffer) {
                mergedParagraphs.push(buffer);
                buffer = "";
            }
            return;
        }

        if (/^!\[.*?\]\(.*?\)$/.test(trimmed)) {
            if (buffer) {
                mergedParagraphs.push(buffer);
                buffer = "";
            }
            mergedParagraphs.push(trimmed);
            return;
        }

        if (!buffer) {
            buffer = trimmed;
        } else {
            const isEndOfSentence = /[.?!'"”’]$/.test(buffer);
            if (isEndOfSentence) {
                mergedParagraphs.push(buffer);
                buffer = trimmed;
            } else {
                buffer += " " + trimmed;
            }
        }
    });

    if (buffer) mergedParagraphs.push(buffer);
    return mergedParagraphs;
}

function splitIntoLines(text) {
    if (!text || !text.trim()) return [];

    const cleanedParagraphs = fixBrokenLineBreaks(text);
    const resultLines = [];

    const actualWidth = readerContainer ? readerContainer.clientWidth : currentContainerWidth;
    const isMobile = window.innerWidth <= 640;
    const charWidthFactor = isMobile ? 15.5 : 15.8;
    const lineLimit = Math.max(22, Math.floor((actualWidth - 40) / charWidthFactor));

    cleanedParagraphs.forEach(paragraph => {
        if (/^!\[.*?\]\(.*?\)$/.test(paragraph.trim())) {
            resultLines.push(paragraph.trim());
            return;
        }

        const words = paragraph.replace(/\s+/g, ' ').split(' ');
        let currentLine = '';

        words.forEach(word => {
            if ((currentLine + ' ' + word).trim().length > lineLimit) {
                if (currentLine) resultLines.push(currentLine.trim());
                currentLine = word;
            } else {
                currentLine += (currentLine ? ' ' : '') + word;
            }
        });

        if (currentLine.trim()) {
            resultLines.push(currentLine.trim());
        }
    });

    return resultLines;
}

function loadText(text) {
    allLines = splitIntoLines(text);
    textFlow.innerHTML = '';
    lineElements = [];

    if (allLines.length === 0) {
        progressCounter.textContent = '0 / 0 줄';
        updateButtons();
        return;
    }

    allLines.forEach((lineText, idx) => {
        const div = document.createElement('div');
        div.dataset.index = idx;

        const imgMatch = lineText.match(/^!\[(.*?)\]\((.*?)\)$/);
        if (imgMatch) {
            div.className = 'line image-line';
            const alt = imgMatch[1];
            const src = imgMatch[2];

            const img = document.createElement('img');
            img.referrerPolicy = 'no-referrer';
            img.src = src;
            img.alt = alt;
            img.loading = 'lazy';

            img.onerror = () => { img.style.display = 'none'; };
            img.onload = () => {
                if (idx === currentLineIdx) goToLine(currentLineIdx);
            };

            div.appendChild(img);

            if (alt && alt !== '본문 이미지') {
                const caption = document.createElement('div');
                caption.className = 'image-caption';
                caption.textContent = alt;
                div.appendChild(caption);
            }
        } else {
            div.className = 'line';
            div.textContent = lineText;
        }

        div.addEventListener('click', () => {
            goToLine(idx);
        });

        textFlow.appendChild(div);
        lineElements.push(div);
    });

    currentLineIdx = 0;
    goToLine(0);
}

function getLineTargetY(lineIdx) {
    if (!lineElements[lineIdx]) return 0;
    const el = lineElements[lineIdx];
    const lineCenter = el.offsetTop + el.offsetHeight / 2;
    const viewportCenter = viewport.offsetHeight / 2;
    return viewportCenter - lineCenter;
}

function findClosestLineIdx(yPos) {
    const viewportCenter = viewport.offsetHeight / 2;
    let closest = 0;
    let minDiff = Infinity;
    for (let i = 0; i < lineElements.length; i++) {
        const el = lineElements[i];
        const lineCenter = el.offsetTop + el.offsetHeight / 2 + yPos;
        const diff = Math.abs(viewportCenter - lineCenter);
        if (diff < minDiff) {
            minDiff = diff;
            closest = i;
        }
    }
    return closest;
}

function goToLine(targetIdx) {
    if (lineElements.length === 0) return;
    currentLineIdx = Math.max(0, Math.min(lineElements.length - 1, targetIdx));

    let activeIndices = [];

    if (isImageIndex(currentLineIdx)) {
        activeIndices = [currentLineIdx];
    } else {
        let start = currentLineIdx;
        let end = currentLineIdx;

        if (start > 0 && !isImageIndex(start - 1)) start--;
        if (end < lineElements.length - 1 && !isImageIndex(end + 1)) end++;
        if ((end - start + 1) < 3 && start > 0 && !isImageIndex(start - 1)) start--;

        for (let i = start; i <= end; i++) activeIndices.push(i);
    }

    lineElements.forEach((el, idx) => {
        if (activeIndices.includes(idx)) el.classList.add('active');
        else el.classList.remove('active');
    });

    velocityY = 0;
    isCoastingToStop = false;
    currentY = getLineTargetY(currentLineIdx);

    textFlow.style.transition = 'transform 0.18s cubic-bezier(0.2, 0.8, 0.25, 1)';
    textFlow.style.transform = `translateY(${currentY}px)`;

    updateCounter();
    updateButtons();
}

function stepNext(stepSize) {
    if (currentLineIdx >= lineElements.length - 1) return;
    triggerHaptic(12);

    if (stepSize === 1 || isImageIndex(currentLineIdx)) {
        goToLine(currentLineIdx + 1);
        return;
    }

    let currentLastActive = currentLineIdx;
    for (let i = currentLineIdx; i <= Math.min(lineElements.length - 1, currentLineIdx + 2); i++) {
        if (lineElements[i].classList.contains('active')) currentLastActive = i;
    }

    let nextStart = currentLastActive + 1;
    if (nextStart >= lineElements.length) return;

    if (isImageIndex(nextStart)) {
        goToLine(nextStart);
        return;
    }

    let nextImageDist = -1;
    for (let i = nextStart; i < lineElements.length; i++) {
        if (isImageIndex(i)) {
            nextImageDist = i - nextStart;
            break;
        }
    }

    if (nextImageDist !== -1 && nextImageDist < 3) {
        goToLine(nextStart + nextImageDist - 1);
    } else {
        goToLine(Math.min(lineElements.length - 1, currentLineIdx + 3));
    }
}

function stepPrev(stepSize) {
    if (currentLineIdx <= 0) return;
    triggerHaptic(12);

    if (stepSize === 1 || isImageIndex(currentLineIdx)) {
        goToLine(currentLineIdx - 1);
        return;
    }
    goToLine(Math.max(0, currentLineIdx - 3));
}

function updateCounter() {
    progressCounter.textContent = `${currentLineIdx + 1} / ${allLines.length} 줄`;
}

function updateButtons() {
    const isAtStart = currentLineIdx <= 0;
    const isAtEnd = currentLineIdx >= lineElements.length - 1 || lineElements.length === 0;

    prev3Btn.disabled = isAtStart;
    prev1Btn.disabled = isAtStart;
    next1Btn.disabled = isAtEnd;
    next3Btn.disabled = isAtEnd;
}

function physicsLoop() {
    if (lineElements.length > 0) {
        const maxY = getLineTargetY(0);
        const minY = getLineTargetY(lineElements.length - 1);

        if (isShuttleDragging) {
            textFlow.style.transition = 'none';
            velocityY = -shuttleOffset * MAX_SHUTTLE_SPEED;
            currentY += velocityY;

            if (currentY > maxY) {
                currentY = maxY + (currentY - maxY) * 0.2;
                velocityY = 0;
            } else if (currentY < minY) {
                currentY = minY + (currentY - minY) * 0.2;
                velocityY = 0;
            }

            textFlow.style.transform = `translateY(${currentY}px)`;
            lineElements.forEach(el => el.classList.add('active'));

            const newIdx = findClosestLineIdx(currentY);
            if (newIdx !== currentLineIdx) {
                currentLineIdx = newIdx;
                triggerHaptic(6);
            }

            updateCounter();
            updateButtons();

        } else if (isCoastingToStop) {
            if (Math.abs(velocityY) > 0.4) {
                textFlow.style.transition = 'none';
                currentY += velocityY;
                velocityY *= friction;

                if (currentY > maxY) {
                    currentY = maxY + (currentY - maxY) * 0.2;
                    velocityY *= 0.5;
                } else if (currentY < minY) {
                    currentY = minY + (currentY - minY) * 0.2;
                    velocityY *= 0.5;
                }

                textFlow.style.transform = `translateY(${currentY}px)`;
                lineElements.forEach(el => el.classList.add('active'));

                currentLineIdx = findClosestLineIdx(currentY);
                updateCounter();
                updateButtons();
            } else {
                isCoastingToStop = false;
                velocityY = 0;
                goToLine(currentLineIdx);
            }
        }

        if (!isShuttleDragging && Math.abs(shuttlePixelOffset) > 0.1) {
            shuttlePixelOffset += (0 - shuttlePixelOffset) * 0.26;
            shuttleThumb.style.transform = `translate(calc(-50% + ${shuttlePixelOffset}px), -50%)`;
        } else if (!isShuttleDragging && shuttlePixelOffset !== 0) {
            shuttlePixelOffset = 0;
            shuttleThumb.style.transform = `translate(-50%, -50%)`;
        }
    }

    requestAnimationFrame(physicsLoop);
}
requestAnimationFrame(physicsLoop);

prev3Btn.addEventListener('click', () => stepPrev(3));
prev1Btn.addEventListener('click', () => stepPrev(1));
next1Btn.addEventListener('click', () => stepNext(1));
next3Btn.addEventListener('click', () => stepNext(3));

window.addEventListener('keydown', (e) => {
    if (document.activeElement === customTextInput) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); stepNext(1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); stepPrev(1); }
    else if (e.key === 'PageDown' || e.key === ' ') { e.preventDefault(); stepNext(3); }
    else if (e.key === 'PageUp') { e.preventDefault(); stepPrev(3); }
});

let wheelCooldown = false;
viewport.addEventListener('wheel', (e) => {
    e.preventDefault();
    if (wheelCooldown) return;
    wheelCooldown = true;
    if (e.deltaY > 0) stepNext(3);
    else if (e.deltaY < 0) stepPrev(3);
    setTimeout(() => { wheelCooldown = false; }, 160);
}, { passive: false });

let touchStartY = 0;
let touchStartX = 0;

viewport.addEventListener('touchstart', (e) => {
    if (e.touches.length === 1) {
        touchStartY = e.touches[0].clientY;
        touchStartX = e.touches[0].clientX;
    }
}, { passive: true });

viewport.addEventListener('touchend', (e) => {
    if (e.changedTouches.length === 1) {
        const deltaY = e.changedTouches[0].clientY - touchStartY;
        const deltaX = e.changedTouches[0].clientX - touchStartX;

        if (Math.abs(deltaY) > 30 && Math.abs(deltaY) > Math.abs(deltaX)) {
            if (deltaY < 0) stepNext(3);
            else stepPrev(3);
        }
    }
}, { passive: true });

function handleShuttleMove(clientX) {
    const rect = shuttleTrack.getBoundingClientRect();
    const trackCenter = rect.left + rect.width / 2;
    const maxDelta = (rect.width - 46) / 2;

    let delta = clientX - trackCenter;
    delta = Math.max(-maxDelta, Math.min(maxDelta, delta));

    shuttlePixelOffset = delta;
    shuttleOffset = delta / maxDelta;
    shuttleThumb.style.transform = `translate(calc(-50% + ${delta}px), -50%)`;
}

shuttleTrack.addEventListener('pointerdown', (e) => {
    isShuttleDragging = true;
    isCoastingToStop = false;
    shuttleTrack.setPointerCapture(e.pointerId);
    handleShuttleMove(e.clientX);
    triggerHaptic(15);
});

shuttleTrack.addEventListener('pointermove', (e) => {
    if (!isShuttleDragging) return;
    handleShuttleMove(e.clientX);
});

const endShuttleDrag = (e) => {
    if (!isShuttleDragging) return;
    isShuttleDragging = false;
    shuttleOffset = 0;
    try { shuttleTrack.releasePointerCapture(e.pointerId); } catch (err) {}

    if (Math.abs(velocityY) > 1.5) {
        isCoastingToStop = true;
    } else {
        velocityY = 0;
        goToLine(currentLineIdx);
    }
};

shuttleTrack.addEventListener('pointerup', endShuttleDrag);
shuttleTrack.addEventListener('pointercancel', endShuttleDrag);

let isResizing = false;
let resizeSide = null;
let startX = 0;
let initialWidth = 760;

function setupResizeHandle(handleEl, side) {
    if (!handleEl) return;

    handleEl.addEventListener('pointerdown', (e) => {
        isResizing = true;
        resizeSide = side;
        startX = e.clientX;
        initialWidth = currentContainerWidth;

        handleEl.setPointerCapture(e.pointerId);
        handleEl.classList.add('resizing');
        if (readerContainer) readerContainer.classList.add('is-resizing');
        if (widthTooltip) {
            widthTooltip.textContent = `${currentContainerWidth}px`;
            widthTooltip.classList.add('visible');
        }
        document.body.style.cursor = 'ew-resize';
    });

    handleEl.addEventListener('pointermove', (e) => {
        if (!isResizing) return;

        const deltaX = e.clientX - startX;
        let newWidth = initialWidth;

        if (resizeSide === 'right') newWidth = initialWidth + deltaX * 2;
        else newWidth = initialWidth - deltaX * 2;

        newWidth = Math.max(480, Math.min(1200, Math.round(newWidth)));
        currentContainerWidth = newWidth;
        document.documentElement.style.setProperty('--reader-width', `${newWidth}px`);

        if (widthTooltip) widthTooltip.textContent = `${newWidth}px`;
    });

    const endResize = (e) => {
        if (!isResizing) return;
        isResizing = false;
        resizeSide = null;

        try { handleEl.releasePointerCapture(e.pointerId); } catch (err) {}

        handleEl.classList.remove('resizing');
        if (readerContainer) readerContainer.classList.remove('is-resizing');
        if (widthTooltip) widthTooltip.classList.remove('visible');
        document.body.style.cursor = '';

        const anchorTarget = allLines[currentLineIdx] || "";
        const isImg = anchorTarget.startsWith('![');
        const anchorWords = !isImg ? anchorTarget.trim().split(/\s+/).slice(0, 2).join(' ') : "";

        loadText(customTextInput.value);

        let restoredIdx = 0;
        if (isImg) {
            const foundIdx = allLines.findIndex(line => line === anchorTarget);
            if (foundIdx !== -1) restoredIdx = foundIdx;
        } else if (anchorWords) {
            const foundIdx = allLines.findIndex(line => line.includes(anchorWords));
            if (foundIdx !== -1) restoredIdx = foundIdx;
        }

        goToLine(restoredIdx);
    };

    handleEl.addEventListener('pointerup', endResize);
    handleEl.addEventListener('pointercancel', endResize);
}

setupResizeHandle(handleLeft, 'left');
setupResizeHandle(handleRight, 'right');

window.addEventListener('resize', () => {
    const anchorTarget = allLines[currentLineIdx] || "";
    const isImg = anchorTarget.startsWith('![');
    const anchorWords = !isImg ? anchorTarget.trim().split(/\s+/).slice(0, 2).join(' ') : "";

    loadText(customTextInput.value);

    let restoredIdx = 0;
    if (isImg) {
        const foundIdx = allLines.findIndex(line => line === anchorTarget);
        if (foundIdx !== -1) restoredIdx = foundIdx;
    } else if (anchorWords) {
        const foundIdx = allLines.findIndex(line => line.includes(anchorWords));
        if (foundIdx !== -1) restoredIdx = foundIdx;
    }

    goToLine(restoredIdx);
});

if (pasteBtn) {
    pasteBtn.addEventListener('click', async () => {
        try {
            const text = await navigator.clipboard.readText();
            if (text && text.trim()) {
                customTextInput.value = text;
                loadText(text);
                triggerHaptic(20);
            } else {
                alert("클립보드에 복사된 텍스트가 없습니다.");
            }
        } catch (err) {
            alert("클립보드 접근 권한을 허용해 주세요.");
        }
    });
}

if (toggleInputBtn) {
    let isCollapsed = false;
    toggleInputBtn.addEventListener('click', () => {
        isCollapsed = !isCollapsed;
        customTextInput.style.display = isCollapsed ? 'none' : 'block';
        toggleInputBtn.textContent = isCollapsed ? '펼치기 ▼' : '접기 ▲';
    });
}

applyBtn.addEventListener('click', () => {
    loadText(customTextInput.value);
});

// 상시 앱 설치 버튼
let deferredPrompt = null;
window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
});

if (installAppBtn) {
    installAppBtn.addEventListener('click', async () => {
        triggerHaptic(15);
        if (deferredPrompt) {
            deferredPrompt.prompt();
            const { outcome } = await deferredPrompt.userChoice;
            if (outcome === 'accepted') {
                installAppBtn.style.display = 'none';
            }
            deferredPrompt = null;
        } else {
            const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
            if (isIOS) {
                alert("아이폰은 브라우저 하단 [공유 버튼(네모+화살표)]을 누른 뒤 [홈 화면에 추가]를 선택해 주세요!");
            } else {
                alert("브라우저 메뉴(점 3개)에서 [앱 설치] 또는 [홈 화면에 추가]를 눌러주세요.");
            }
        }
    });
}

window.addEventListener('appinstalled', () => {
    if (installAppBtn) {
        installAppBtn.style.display = 'none';
    }
    deferredPrompt = null;
});

// ==========================================
// [모바일 기사 URL 자동 본문 추출 엔진]
// ==========================================
window.addEventListener('DOMContentLoaded', async () => {
    const urlParams = new URLSearchParams(window.location.search);
    const sharedTitle = urlParams.get('title') || '';
    const sharedText = urlParams.get('text') || '';
    const sharedUrl = urlParams.get('url') || '';

    // 공유로 들어온 데이터에서 HTTP URL 주소 검출
    let targetUrl = sharedUrl;
    if (!targetUrl && sharedText) {
        const urlMatch = sharedText.match(/https?:\/\/[^\s]+/);
        if (urlMatch) targetUrl = urlMatch[0];
    }

    // 1. 기사 URL이 감지된 경우: 백그라운드 파싱 실행
    if (targetUrl) {
        customTextInput.value = "기사 본문을 불러오는 중입니다...";
        loadText("기사 본문을 불러오는 중입니다...\n잠시만 기다려 주세요.");

        try {
            // CORS 우회 무료 프록시를 통해 기사 원문 HTML 호출
            const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(targetUrl)}`;
            const response = await fetch(proxyUrl);
            if (!response.ok) throw new Error("네트워크 응답 에러");
            const html = await response.text();

            // 가져온 HTML을 DOM 객체로 변환
            const parser = new DOMParser();
            const doc = parser.parseFromString(html, 'text/html');

            // Mozilla Readability 엔진으로 메뉴/광고 날리고 본문만 정밀 파싱
            if (typeof Readability !== 'undefined') {
                const reader = new Readability(doc);
                const article = reader.parse();

                if (article && article.textContent && article.textContent.trim().length > 60) {
                    const finalContent = `${article.title}\n\n${article.textContent.trim()}`;
                    customTextInput.value = finalContent;
                    loadText(finalContent);
                    return;
                }
            }
            throw new Error("본문 추출 불가");
        } catch (err) {
            // 방화벽/페이월이 걸려있는 사이트일 경우 안내 문구
            const fallback = (sharedTitle ? sharedTitle + '\n\n' : '') + 
                "⚠️ 보안/방화벽이 걸려있는 언론사 사이트입니다.\n기사 본문을 복사한 후 상단의 [📋 클립보드 붙여넣기]를 눌러주세요!\n\n" + targetUrl;
            customTextInput.value = fallback;
            loadText(fallback);
        }

    // 2. 텍스트가 직접 넘어왔거나 기본 실행인 경우
    } else {
        const combined = [sharedTitle, sharedText].filter(Boolean).join('\n\n');
        if (combined.trim()) {
            customTextInput.value = combined;
            loadText(combined);
        } else {
            loadText(customTextInput.value);
        }
    }
});

// PC 크롬 확장 프로그램 연동 유지
if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
    chrome.storage.local.get(["rr_text"], (data) => {
        if (data && data.rr_text && data.rr_text.trim()) {
            customTextInput.value = data.rr_text;
            loadText(data.rr_text);
        }
    });
}