const backendUrl = "http://localhost:1431";

async function fetchRecommendedModel(retryDelay = 2000) {
  try {
    const response = await fetch(`${backendUrl}/recommended_model`);
    const data = await response.json();
    if (data && data.model_id) {
      const modelSelect = document.getElementById('model-select');
      modelSelect.value = data.model_id;
      if (data.model_id === "CPU") {
        showDialog("⚠️ Your device does not have GPU. Model generation will be significantly slow.");
      }
      document.getElementById("backend-overlay").style.display = "none";
    } else {
      showDialog("⚠️ We are unable to detect any GPU on your device. Model generation might be significantly slow.");
    }
  } catch (error) {
    console.error("Error fetching recommended model:", error);
    setTimeout(() => fetchRecommendedModel(retryDelay), retryDelay);
  }
}

function updateModelProgress(modelId) {
  fetch(`${backendUrl}/model_status?model_id=${encodeURIComponent(modelId)}`)
    .then(response => response.json())
    .then(status => {
      const progressContainer = document.getElementById("progress-container");
      const progressBar = document.getElementById("model-progress");
      const progressText = document.getElementById("progress-text");
      progressBar.value = status.progress;
      progressText.innerText = `Download progress: ${status.progress}%`;
      progressContainer.style.display = status.progress < 100 ? 'block' : 'none';
      if (status.progress < 100) {
        setTimeout(() => updateModelProgress(modelId), 2000);
      }
    })
    .catch(err => console.error("Error fetching model progress:", err));
}

function createEditor(containerId, initialValue) {
  const container = document.getElementById(containerId);
  container.style.position = 'relative';

  const copyButton = document.createElement('button');
  copyButton.className = 'copy-button';
  copyButton.textContent = 'Copy';
  copyButton.dataset.valid = 'false';
  container.appendChild(copyButton);

  const editor = monaco.editor.create(container, {
    value: initialValue,
    language: 'sql',
    theme: 'vs-dark',
    fontSize: 14,
    automaticLayout: true,
    scrollBeyondLastLine: false,
    scrollbar: { vertical: 'auto', horizontal: 'auto' }
  });

  const parser = new NodeSQLParser.Parser();

  function validateAndToggleCopy() {
    const model = editor.getModel();
    const code = model.getValue();
    const markers = [];

    try {
      parser.astify(code);
      copyButton.dataset.valid = 'true';
    } catch (err) {
      markers.push({
        startLineNumber: err.location.start.line,
        startColumn: err.location.start.column,
        endLineNumber: err.location.end.line,
        endColumn: err.location.end.column,
        message: err.message || "SQL syntax error",
        severity: monaco.MarkerSeverity.Error
      });
      copyButton.dataset.valid = 'false';
    }

    monaco.editor.setModelMarkers(model, 'sql-linter', markers);
  }

  editor.onDidChangeModelContent(validateAndToggleCopy);
  validateAndToggleCopy();

  copyButton.addEventListener('click', () => {
    const content = editor.getValue();
    navigator.clipboard.writeText(content).then(() => {
      copyButton.textContent = 'Copied!';
      setTimeout(() => copyButton.textContent = 'Copy', 1000);
    });
  });

  return editor;
}

window.showDialog = function(message) {
  const dialog = document.getElementById("custom-dialog");
  const msgBox = document.getElementById("dialog-message");
  if (dialog && msgBox) {
    msgBox.innerHTML = message;
    dialog.style.display = "flex";
  }
};

window.closeDialog = function() {
  const dialog = document.getElementById("custom-dialog");
  if (dialog) {
    dialog.style.display = "none";
  }
};

window.toggleShareMenu = function () {
  const menu = document.getElementById('share-menu');
  if (menu.classList.contains('hidden')) {
    menu.classList.remove('hidden');

    // Set up outside click listener
    setTimeout(() => {
      document.addEventListener('click', outsideClickListener);
    }, 0);
  } else {
    hideShareMenu();
  }
};

function outsideClickListener(e) {
  const menu = document.getElementById('share-menu');
  const shareBtn = document.getElementById('share-btn');

  if (!menu.contains(e.target) && e.target !== shareBtn) {
    hideShareMenu();
  }
}

function hideShareMenu() {
  const menu = document.getElementById('share-menu');
  menu.classList.add('hidden');
  document.removeEventListener('click', outsideClickListener);
}

window.onload = function () {
  require.config({
    paths: { vs: 'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.34.1/min/vs' }
  });

  require(['vs/editor/editor.main'], function () {
    monaco.languages.register({ id: 'sql' });
    monaco.languages.setMonarchTokensProvider('sql', {
      tokenizer: {
        root: [
          [/\b(SELECT|FROM|WHERE|INSERT|INTO|VALUES|UPDATE|DELETE|CREATE|DROP|TABLE|JOIN|ON|AS)\b/i, "keyword"],
          [/"[^"]*"/, "string"],
          [/'[^']*'/, "string"],
          [/\b\d+\b/, "number"],
          [/[a-zA-Z_][\w$]*/, "identifier"],
        ]
      }
    });

    const leftEditorInstance = createEditor('left-editor', '-- Enter your schemas here\n\nCREATE TABLE users (\n  id INT,\n  name TEXT\n);');

    const tabs = document.getElementById('tabs');
    const tabEditors = document.getElementById('tab-editors');
    let tabCount = 0;
    let activeTabId = null;

    function addTab(label, initialValue) {
      const tabId = `tab-${tabCount++}`;
      const tab = document.createElement('div');
      tab.className = 'tab';
      tab.innerText = label;
      tab.dataset.id = tabId;
      const editorDiv = document.createElement('div');
      editorDiv.className = 'tab-editor editor-container';
      editorDiv.id = tabId;
      tabEditors.appendChild(editorDiv);
      createEditor(tabId, initialValue);
      tab.onclick = () => setActiveTab(tabId);
      tabs.appendChild(tab);
      setActiveTab(tabId);
    }

    function setActiveTab(tabId) {
      Array.from(document.getElementsByClassName('tab')).forEach(tab => {
        tab.classList.toggle('active', tab.dataset.id === tabId);
      });
      Array.from(document.getElementsByClassName('tab-editor')).forEach(div => {
        div.classList.toggle('active', div.id === tabId);
      });
      activeTabId = tabId;
    }

    addTab('Query', '-- OneSQL-generated query\n\nSELECT * FROM users;');

    const shareBtn = document.createElement('button');
    shareBtn.id = 'share-btn';
    shareBtn.textContent = 'Share';
    shareBtn.title = 'Distribute this app';
    shareBtn.onclick = () => toggleShareMenu();
    tabs.appendChild(shareBtn);    

    let eventSource = null;
    const downloadedModels = new Set();

    async function handleSend() {
      const nlInput = document.getElementById('nl-input').value;
      const schemaValue = leftEditorInstance.getValue();
      const modelChoice = document.getElementById('model-select').value;

      if (!nlInput) {
        showDialog("🚫 Please enter a natural language query.");
        return;
      }
    
      const leftValid = document.querySelector('#left-editor .copy-button')?.dataset.valid;
      if (leftValid !== 'true') {
        showDialog("🚫 Please fix schema syntax errors first.");
        return;
      }
      
      const progressContainer = document.getElementById("progress-container");
      const progressBar = document.getElementById("model-progress");
      const progressText = document.getElementById("progress-text");

      // Skip download if already done
      if (downloadedModels.has(modelChoice)) {
        await triggerInference();
        return;
      }

      progressContainer.style.display = 'block';
      progressBar.value = 0;
      progressText.innerText = "Download starting...";

      eventSource = new EventSource(`${backendUrl}/download_model?model_id=${encodeURIComponent(modelChoice)}`);

      eventSource.onmessage = async function(event) {
        const percent = parseInt(event.data);
        progressBar.value = percent;
        progressText.innerText = `Download progress: ${percent}%`;

        if (percent >= 100) {
          eventSource.close();
          downloadedModels.add(modelChoice);
          progressText.innerText = "Download complete!";
          setTimeout(() => progressContainer.style.display = 'none', 1000);
          await triggerInference();
        }
      };

      eventSource.onerror = function(err) {
        console.error("Download stream error:", err);
        progressText.innerText = "Download failed.";
        progressBar.value = 0;
        eventSource.close();
      };

      async function triggerInference() {
        try {
          const response = await fetch(`${backendUrl}/infer`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ schema: schemaValue, user_query: nlInput, model: modelChoice })
          });

          const reader = response.body.getReader();
          const decoder = new TextDecoder("utf-8");
          const activeEditorDiv = document.getElementById(activeTabId);
          const activeEditor = monaco.editor.getEditors().find(editor =>
            editor.getDomNode().parentElement === activeEditorDiv
          );

          let fullText = "";
          while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            const chunk = decoder.decode(value, { stream: true });
            fullText += chunk;
            if (activeEditor) activeEditor.setValue(fullText);
          }
        } catch (err) {
          console.error("❌ Stream error:", err);
          alert("Failed to get a response from the server.");
        }
      }
    };

    document.getElementById('send-btn').onclick = handleSend;

    document.getElementById('nl-input').addEventListener("keydown", function (e) {
      if (e.key === "Enter") {
        e.preventDefault();
        handleSend();
      }
    });
  
    document.getElementById('cancel-download').onclick = function () {
      if (eventSource) {
        eventSource.close();
        document.getElementById("progress-text").innerText = "Download cancelled.";
        document.getElementById("progress-container").style.display = 'none';
        eventSource = null;
      }
    };

    // Vertical resizer
    const dragbar = document.getElementById('dragbar');
    const leftPane = document.getElementById('left-pane');
    dragbar.addEventListener('mousedown', function (e) {
      e.preventDefault();
      document.addEventListener('mousemove', resizeLeftRight, false);
      document.addEventListener('mouseup', stopResizeLeftRight, false);
    });
    function resizeLeftRight(e) {
      leftPane.style.width = e.clientX + 'px';
    }
    function stopResizeLeftRight() {
      document.removeEventListener('mousemove', resizeLeftRight, false);
      document.removeEventListener('mouseup', stopResizeLeftRight, false);
    }

    // Horizontal resizer
    const horizResizer = document.getElementById('horizontal-resizer');
    const topRight = document.getElementById('top-right-pane');
    const bottomRight = document.getElementById('bottom-right');
    horizResizer.addEventListener('mousedown', function (e) {
      e.preventDefault();
      document.addEventListener('mousemove', resizeTopBottom, false);
      document.addEventListener('mouseup', stopResizeTopBottom, false);
    });
    function resizeTopBottom(e) {
      const containerTop = document.getElementById('right-pane').getBoundingClientRect().top;
      const totalHeight = document.getElementById('right-pane').offsetHeight;
      const offsetY = e.clientY - containerTop;
      topRight.style.flex = 'none';
      topRight.style.height = offsetY + 'px';
      bottomRight.style.height = (totalHeight - offsetY - 5) + 'px';
    }
    function stopResizeTopBottom() {
      document.removeEventListener('mousemove', resizeTopBottom, false);
      document.removeEventListener('mouseup', stopResizeTopBottom, false);
    }

    document.getElementById('github-link')?.addEventListener('click', (e) => {
      e.preventDefault();
      fetch("http://localhost:1431/open_link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: "https://github.com/onekq/onekq-apple" })
      });
    });
    
    document.getElementById('email-link')?.addEventListener('click', (e) => {
      e.preventDefault();
      fetch("http://localhost:1431/open_link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: "mailto:developers@onekq.ai" })
      });
    });

    const shareButtons = document.querySelectorAll('.share-buttons button[data-type]');
    const shareUrl = "https://github.com/onekq/onekq-apple";
    
    shareButtons.forEach(btn => {
      btn.onclick = () => {
        let targetUrl = "";
    
        switch (btn.dataset.type) {
          case "email":
            targetUrl = `mailto:?subject=Try%20this%20SQL%20App&body=${shareUrl}`;
            break;
          case "twitter":
            targetUrl = `https://twitter.com/intent/tweet?text=Check%20out%20this%20SQL%20App!%20${shareUrl}`;
            break;
          case "linkedin":
            targetUrl = `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(shareUrl)}`;
            break;
          case "reddit":
            targetUrl = `https://www.reddit.com/submit?url=${encodeURIComponent(shareUrl)}&title=Check%20out%20this%20SQL%20App!`;
            break;
        }
    
        fetch("http://localhost:1431/open_link", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: targetUrl })
        });
      };
    });
    
    document.getElementById('copy-link').onclick = () => {
      const githubLink = "https://github.com/onekq/onekq-apple";
    
      navigator.clipboard.writeText(githubLink).then(() => {
        document.getElementById('copy-link').textContent = 'Copied!';
        setTimeout(() => {
          document.getElementById('copy-link').textContent = 'Copy Link';
        }, 1200);
      });
    };
      
    // Call fetchRecommendedModel once after everything has been initialized
    fetchRecommendedModel();
  });
};
