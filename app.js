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

function isImageIndex(idx) {
    return lineElements[idx] && lineElements[idx].classList.contains('image-line');
}

/**
 * 웹에서 줄바꿈 없이 쫙 붙어서 들어온 텍스트를 문장 단위로 자동 분리 및 복원
 */
function fixBrokenLineBreaks(rawText) {
    if (!rawText) return [];

    let text = rawText.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();

    // 1. 이미 문단(엔터) 구분이 잘 되어 있는 경우: 중간 끊김만 보정
    if (text.includes('\n')) {
        const rawParagraphs = text.split('\n');
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

    // 2. [핵심] 줄바꿈 없이 쫙 붙어서 한 덩어리로 들어온 경우:
    // 온전한 문장 종결 부호 (. ? !) 뒤에서 강제로 문단 분리
    text = text.replace(/([.?!]["”’']?)\s+/g, "$1\n\n");
    return text.split('\n\n').map(p => p.trim()).filter(Boolean);
}

// [원본 복원] 글자가 어색하게 깨지지 않던 원본 계산식 그대로 사용
function splitIntoLines(text) {
    if (!text || !text.trim()) return [];

    const cleanedParagraphs = fixBrokenLineBreaks(text);
    const resultLines = [];

    const lineLimit = Math.max(22, Math.floor((currentContainerWidth - 80) / 19));

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
            img.src = src;
            img.alt = alt;
            img.loading = 'lazy';

            img.onload = () => {
                if (idx === currentLineIdx) {
                    goToLine(currentLineIdx);
                }
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

    if (stepSize === 1) {
        goToLine(currentLineIdx + 1);
        return;
    }

    if (isImageIndex(currentLineIdx)) {
        goToLine(currentLineIdx + 1);
        return;
    }

    let currentLastActive = currentLineIdx;
    for (let i = currentLineIdx; i <= Math.min(lineElements.length - 1, currentLineIdx + 2); i++) {
        if (lineElements[i].classList.contains('active')) {
            currentLastActive = i;
        }
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

            currentLineIdx = findClosestLineIdx(currentY);
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

// 리사이즈 드래그 핸들 이벤트
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

        if (resizeSide === 'right') {
            newWidth = initialWidth + deltaX * 2;
        } else {
            newWidth = initialWidth - deltaX * 2;
        }

        newWidth = Math.max(480, Math.min(1200, Math.round(newWidth)));
        currentContainerWidth = newWidth;
        document.documentElement.style.setProperty('--reader-width', `${newWidth}px`);

        if (widthTooltip) {
            widthTooltip.textContent = `${newWidth}px`;
        }
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
            else {
                const firstWord = anchorWords.split(' ')[0];
                const fallbackIdx = allLines.findIndex(line => line.includes(firstWord));
                if (fallbackIdx !== -1) restoredIdx = fallbackIdx;
            }
        }

        goToLine(restoredIdx);
    };

    handleEl.addEventListener('pointerup', endResize);
    handleEl.addEventListener('pointercancel', endResize);
}

setupResizeHandle(handleLeft, 'left');
setupResizeHandle(handleRight, 'right');

applyBtn.addEventListener('click', () => {
    loadText(customTextInput.value);
});

function applyExtractedText(text) {
    if (!text || !text.trim()) return;
    customTextInput.value = text;
    loadText(text);
}

// ==========================================
// [background.js와 동일한 Readability 추출 함수]
// ==========================================
function parseContentWithReadability(htmlString, plainText) {
    if (htmlString && typeof Readability !== 'undefined') {
        try {
            const parser = new DOMParser();
            const doc = parser.parseFromString(htmlString, "text/html");
            const reader = new Readability(doc);
            const article = reader.parse();

            if (article && article.content) {
                const articleDoc = parser.parseFromString(article.content, "text/html");
                const blocks = [];

                function walk(node) {
                    if (!node) return;
                    if (node.nodeType === Node.ELEMENT_NODE) {
                        const tag = node.tagName.toLowerCase();
                        if (['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'li'].includes(tag)) {
                            const text = node.textContent.trim();
                            if (text) blocks.push(text);
                            return;
                        }
                        for (const child of node.childNodes) {
                            walk(child);
                        }
                    }
                }
                walk(articleDoc.body);

                const title = article.title ? article.title.trim() : "";
                const bodyContent = blocks.join("\n\n");
                const cleanResult = title ? `${title}\n\n${bodyContent}` : bodyContent;
                if (cleanResult.trim()) return cleanResult;
            }
        } catch (e) {
            console.error("Readability 파싱 실패:", e);
        }
    }
    return plainText || "";
}

// [클립보드 붙여넣기 버튼]
if (pasteBtn) {
    pasteBtn.addEventListener('click', async () => {
        try {
            let htmlText = "";
            let plainText = "";

            if (navigator.clipboard && navigator.clipboard.read) {
                const items = await navigator.clipboard.read();
                for (const item of items) {
                    if (item.types.includes('text/html')) {
                        const blob = await item.getType('text/html');
                        htmlText = await blob.text();
                    }
                    if (item.types.includes('text/plain')) {
                        const blob = await item.getType('text/plain');
                        plainText = await blob.text();
                    }
                }
            } else {
                plainText = await navigator.clipboard.readText();
            }

            const cleanText = parseContentWithReadability(htmlText, plainText);
            if (cleanText && cleanText.trim()) {
                applyExtractedText(cleanText);
            } else {
                alert("클립보드에 복사된 내용이 없습니다.");
            }
        } catch (err) {
            try {
                const fallback = await navigator.clipboard.readText();
                applyExtractedText(fallback);
            } catch (e) {
                alert("클립보드 접근 권한을 허용해 주세요.");
            }
        }
    });
}

// [PWA 앱 설치 버튼]
let deferredPrompt = null;
window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
});

if (installAppBtn) {
    installAppBtn.addEventListener('click', async () => {
        if (deferredPrompt) {
            deferredPrompt.prompt();
            const { outcome } = await deferredPrompt.userChoice;
            if (outcome === 'accepted') {
                installAppBtn.style.display = 'none';
            }
            deferredPrompt = null;
        } else {
            alert("브라우저 메뉴에서 '앱 설치' 또는 '홈 화면에 추가'를 눌러주세요.");
        }
    });
}

window.addEventListener('appinstalled', () => {
    if (installAppBtn) installAppBtn.style.display = 'none';
    deferredPrompt = null;
});

// 초기 실행
loadText(customTextInput.value);

if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
    chrome.storage.local.get(["rr_text"], (data) => {
        if (data && data.rr_text && data.rr_text.trim()) {
            applyExtractedText(data.rr_text);
        }
    });

    if (chrome.storage.onChanged) {
        chrome.storage.onChanged.addListener((changes, area) => {
            if (area === "local" && changes.rr_text && changes.rr_text.newValue) {
                applyExtractedText(changes.rr_text.newValue);
            }
        });
    }
}