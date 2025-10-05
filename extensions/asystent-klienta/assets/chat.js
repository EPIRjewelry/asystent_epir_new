(function(){
  const elForm = document.getElementById('assistant-form');
  const elInput = document.getElementById('assistant-input');
  const elMsgs = document.getElementById('assistant-messages');

  let sessionId = localStorage.getItem('epir_session') || null;

  // Helper: Create a new assistant message element
  function createAssistantMessage() {
    const div = document.createElement('div');
    div.className = 'msg msg-assistant';
    div.textContent = '';
    elMsgs.appendChild(div);
    elMsgs.scrollTop = elMsgs.scrollHeight;
    return div;
  }

  // Helper: Update assistant message content
  function updateAssistantMessage(element, text) {
    element.textContent = text;
    elMsgs.scrollTop = elMsgs.scrollHeight;
  }

  // Helper: Add user message
  function addUserMessage(text) {
    const div = document.createElement('div');
    div.className = 'msg msg-user';
    div.textContent = text;
    elMsgs.appendChild(div);
    elMsgs.scrollTop = elMsgs.scrollHeight;
  }

  // Helper: Add error message
  function addErrorMessage(text) {
    const div = document.createElement('div');
    div.className = 'msg msg-error';
    div.textContent = text;
    elMsgs.appendChild(div);
    elMsgs.scrollTop = elMsgs.scrollHeight;
  }

  // Handle streaming response (SSE format)
  async function handleStreamingResponse(response) {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let assistantElement = null;
    let fullContent = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        
        // Keep the last incomplete line in the buffer
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.trim() || line.trim() === '') continue;
          
          // SSE format: "data: {...}"
          if (line.startsWith('data: ')) {
            const dataStr = line.slice(6);
            
            // Check for [DONE] signal
            if (dataStr === '[DONE]') {
              continue;
            }

            try {
              const data = JSON.parse(dataStr);
              
              // Handle meta chunk (first chunk with session_id)
              if (data.session_id && !data.content && !data.error) {
                sessionId = data.session_id;
                localStorage.setItem('epir_session', sessionId);
                continue;
              }

              // Handle error
              if (data.error) {
                addErrorMessage('Błąd: ' + data.error);
                return;
              }

              // Handle content chunks
              if (data.content) {
                if (!assistantElement) {
                  assistantElement = createAssistantMessage();
                }
                fullContent = data.content;
                updateAssistantMessage(assistantElement, fullContent);

                // Update session_id if provided
                if (data.session_id) {
                  sessionId = data.session_id;
                  localStorage.setItem('epir_session', sessionId);
                }
              }
            } catch (e) {
              console.error('Failed to parse SSE data:', dataStr, e);
            }
          }
        }
      }
    } catch (error) {
      console.error('Streaming error:', error);
      addErrorMessage('Przepraszam, wystąpił błąd podczas streamingu.');
    }
  }

  // Handle JSONL/NDJSON streaming response
  async function handleJsonlResponse(response) {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let assistantElement = null;
    let fullContent = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        
        // Keep the last incomplete line in the buffer
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.trim()) continue;

          try {
            const data = JSON.parse(line);
            
            // Handle meta chunk (first chunk with session_id)
            if (data.type === 'meta' && data.session_id) {
              sessionId = data.session_id;
              localStorage.setItem('epir_session', sessionId);
              continue;
            }

            // Handle error
            if (data.error) {
              addErrorMessage('Błąd: ' + data.error);
              return;
            }

            // Handle content chunks
            if (data.content !== undefined) {
              if (!assistantElement) {
                assistantElement = createAssistantMessage();
              }
              fullContent = data.content;
              updateAssistantMessage(assistantElement, fullContent);

              // Update session_id if provided
              if (data.session_id) {
                sessionId = data.session_id;
                localStorage.setItem('epir_session', sessionId);
              }
            }
          } catch (e) {
            console.error('Failed to parse JSONL:', line, e);
          }
        }
      }
    } catch (error) {
      console.error('Streaming error:', error);
      addErrorMessage('Przepraszam, wystąpił błąd podczas streamingu.');
    }
  }

  // Form submit handler
  elForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const text = elInput.value.trim();
    if (!text) return;

    addUserMessage(text);
    elInput.value = '';
    elInput.disabled = true;

    try {
      const res = await fetch('/apps/assistant/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ 
          message: text, 
          session_id: sessionId,
          stream: true  // Request streaming
        })
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      }

      // Check content type to determine streaming format
      const contentType = res.headers.get('content-type') || '';
      
      if (contentType.includes('text/event-stream')) {
        // SSE format
        await handleStreamingResponse(res);
      } else if (contentType.includes('application/x-ndjson') || contentType.includes('application/jsonl')) {
        // JSONL/NDJSON format
        await handleJsonlResponse(res);
      } else if (contentType.includes('application/json')) {
        // Fallback: non-streaming JSON response
        const data = await res.json();
        if (data && data.reply) {
          const assistantElement = createAssistantMessage();
          updateAssistantMessage(assistantElement, data.reply);
        }
        if (data && data.session_id) {
          sessionId = data.session_id;
          localStorage.setItem('epir_session', sessionId);
        }
      } else {
        throw new Error('Nieobsługiwany format odpowiedzi');
      }
    } catch (err) {
      console.error('Chat error:', err);
      addErrorMessage('Przepraszam, wystąpił błąd: ' + err.message);
    } finally {
      elInput.disabled = false;
      elInput.focus();
    }
  });
})();
