import express from 'express';
import { Client } from '@notionhq/client';
import cors from 'cors';
import dotenv from 'dotenv';
dotenv.config();

const app = express();
const port = 8000;

// Middleware
app.use(cors());
app.use(express.json());

// Notion Client
const notion = new Client({ auth: process.env.NOTION_API_KEY });
const subscriptionsDbId = process.env.NOTION_SUBSCRIPTIONS_DB_ID;
const tasksDbId = process.env.NOTION_TASKS_DB_ID;
const dashResetDbId = process.env.NOTION_DASH_RESET_DB_ID; // New Database ID

// --- API Routes ---

// GET Subscriptions
app.get('/api/notion/subscriptions', async (req, res) => {
    if (!subscriptionsDbId) return res.status(500).json({ error: "DB ID is not configured." });
    try {
        const response = await notion.databases.query({ database_id: subscriptionsDbId });
        const items = response.results.map((page) => ({
            id: page.id,
            name: page.properties.Nom?.title[0]?.plain_text || 'Unnamed',
            amount: page.properties.Montant?.number || 0,
        }));
        res.json({ items });
    } catch (error) {
        console.error("Notion fetch error (Subscriptions):", error.message);
        res.status(500).json({ error: "Failed to fetch from Notion." });
    }
});

// POST Task
app.post('/api/notion/tasks', async (req, res) => {
    if (!tasksDbId) return res.status(500).json({ error: "Tasks DB ID is not configured." });
    const { title } = req.body;
    if (!title) return res.status(400).json({ error: "Task title required." });
    try {
        await notion.pages.create({
            parent: { database_id: tasksDbId },
            properties: { 'Title': { title: [{ text: { content: title } }] } }
        });
        res.status(201).json({ success: true, title });
    } catch (error) {
        console.error("Notion task creation error:", error.message);
        res.status(500).json({ error: "Failed to create task in Notion." });
    }
});

// GET Daily Resets
app.get('/api/notion/resets', async (req, res) => {
    if (!dashResetDbId) return res.status(500).json({ error: "Reset DB ID is not configured." });
    try {
        const response = await notion.databases.query({
            database_id: dashResetDbId,
            sorts: [{ property: 'Date', direction: 'descending' }], // Get the latest first
            page_size: 1 // We only want the most recent entry
        });
        if (response.results.length === 0) {
            return res.json({ item: null, message: "No daily reset entries found." });
        }
        const latestEntry = response.results[0];
        // NOTE: Adjust property names to match your DB exactly
        const resetData = {
            id: latestEntry.id,
            title: latestEntry.properties.Name?.title[0]?.plain_text || 'Untitled Reset',
            biggestWin: latestEntry.properties['Biggest Win']?.rich_text[0]?.plain_text || 'Not specified.',
            reflection: latestEntry.properties['Reflection']?.rich_text[0]?.plain_text || 'No reflection recorded.'
        };
        res.json({ item: resetData });
    } catch (error) {
        console.error("Notion fetch error (Resets):", error.message);
        res.status(500).json({ error: "Failed to fetch daily resets from Notion." });
    }
});

// Fallback Chat Endpoint
app.post('/api/chat', (req, res) => {
    console.log("Received fallback chat request:", req.body.message);
    // This is a simple fallback. In the future, you could add
    // a direct API call to Gemini here if n8n is down.
    res.status(200).json({ 
        response: "My core network seems to be unavailable, but I've received your message through a secondary channel. I am processing your request now." 
    });
});

// PATCH Update Subscription
app.patch('/api/notion/subscriptions/:id', async (req, res) => {
    const { id } = req.params;
    const { updates } = req.body; // updates should be an object like { name: "new name", renewalDate: "YYYY-MM-DD" }

    if (!subscriptionsDbId) return res.status(500).json({ error: "DB ID is not configured." });
    if (!id || !updates) return res.status(400).json({ error: "Subscription ID and updates required." });

    try {
        const propertiesToUpdate = {};
        if (updates.name !== undefined) {
            propertiesToUpdate.Nom = { title: [{ text: { content: updates.name } }] };
        }
        if (updates.whatsapp !== undefined) {
            // Assuming 'WhatsApp' is a text property in your Notion DB
            propertiesToUpdate.WhatsApp = { rich_text: [{ text: { content: updates.whatsapp } }] };
        }
        if (updates.renewalDate !== undefined) {
            // Assuming 'Renewal Date' is a date property in your Notion DB
            propertiesToUpdate['Renewal Date'] = { date: { start: updates.renewalDate } };
        }
        // Add other properties as needed based on your Notion DB schema

        if (Object.keys(propertiesToUpdate).length === 0) {
            return res.status(400).json({ error: "No valid properties provided for update." });
        }

        await notion.pages.update({
            page_id: id,
            properties: propertiesToUpdate,
        });
        res.json({ success: true, id, updates });
    } catch (error) {
        console.error("Notion update error (Subscription):", error.message);
        res.status(500).json({ error: `Failed to update subscription ${id}.` });
    }
});

// DELETE Archive Subscription
app.delete('/api/notion/subscriptions/:id', async (req, res) => {
    const { id } = req.params;
    const { reason } = req.body; // Optional reason for archiving

    if (!subscriptionsDbId) return res.status(500).json({ error: "DB ID is not configured." });
    if (!id) return res.status(400).json({ error: "Subscription ID required for archiving." });

    try {
        // To 'archive' in Notion, you typically set the 'archived' property to true
        await notion.pages.update({
            page_id: id,
            archived: true, // This is the standard way to archive a page in Notion
        });

        // You might also want to log the reason in a Notion property if you have one for "Archive Reason"
        // Example: if (reason) {
        //     await notion.pages.update({
        //         page_id: id,
        //         properties: { 'Archive Reason': { rich_text: [{ text: { content: reason } }] } }
        //     });
        // }

        res.json({ success: true, id, reason: reason || 'Archived without specific reason.' });
    } catch (error) {
        console.error("Notion archive error (Subscription):", error.message);
        res.status(500).json({ error: `Failed to archive subscription ${id}.` });
    }
});

// --- Start Server --- (ONLY ONE!)
app.listen(port, () => {
    console.log(`🚀 Zion backend is live on port ${port}`);
});