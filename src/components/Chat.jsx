import { GoogleGenerativeAI } from "@google/generative-ai";
import './Chat.css'
import { useState } from 'react'
import { geminiModel } from "../firebase/config";

function Chat({file}) {
    const [messages, setMessages] = useState([]);
    const [input, setInput] = useState("");

    async function handleSendMessage(){
        if(input.length) {
            let chatMessages = [...messages, {role: "user", text: input}, {role: "loader", text: ""}];
            setInput("");
            setMessages(chatMessages);

            try {
                const result = await geminiModel.generateContent([
                  {
                      inlineData: {
                          data: file.file,
                          mimeType: file.type,
                      },
                  },
                  `
                    Answer this question about the attached document: ${input}.
                    Answer as a chatbot with short messages and text only (no markdowns, tags or symbols)
                    Chat history: ${JSON.stringify(messages)}
                  `,
                ]);

                chatMessages = [...chatMessages.filter((msg)=>msg.role != 'loader'), {role: "model", text: result.response.text()}]
                setMessages(chatMessages);
              } catch (error) {
                chatMessages = [...chatMessages.filter((msg)=>msg.role != 'loader'), {role: "error", text: "Error sending messages, please try again later."}]
                setMessages(chatMessages);
                console.error("Error in handleSendMessage:", error);
              }
        }
    }

    return (
      <section className="chat-window">
        <h2>Chat</h2>
        {
            messages.length ?
            <div className="chat">
                {
                    messages.map((msg)=>(
                        <div className={msg.role} key={msg.text}>
                            <p>{msg.text}</p>
                        </div>
                    ))
                }
            </div> :
            ''
        }
        
        <div className="input-area">
            <input 
                value={input}
                onChange={(e)=>setInput(e.target.value)}
                type="text"
                placeholder="Ask any question about the uploaded document..."
            />
            <button onClick={handleSendMessage}>Send</button>
        </div>
      </section>
    )
  }
  
  export default Chat
  