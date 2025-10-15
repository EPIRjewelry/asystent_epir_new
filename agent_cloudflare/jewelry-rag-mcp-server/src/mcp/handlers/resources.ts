import { Request, Response } from 'cloudflare-worker-types';
import { fetchResource, createResource, updateResource, deleteResource } from '../../services/resourceService';

export const handleGetResource = async (request: Request): Promise<Response> => {
    const resourceId = request.url.split('/').pop();
    const resource = await fetchResource(resourceId);
    return new Response(JSON.stringify(resource), {
        headers: { 'Content-Type': 'application/json' },
    });
};

export const handleCreateResource = async (request: Request): Promise<Response> => {
    const resourceData = await request.json();
    const newResource = await createResource(resourceData);
    return new Response(JSON.stringify(newResource), {
        status: 201,
        headers: { 'Content-Type': 'application/json' },
    });
};

export const handleUpdateResource = async (request: Request): Promise<Response> => {
    const resourceId = request.url.split('/').pop();
    const resourceData = await request.json();
    const updatedResource = await updateResource(resourceId, resourceData);
    return new Response(JSON.stringify(updatedResource), {
        headers: { 'Content-Type': 'application/json' },
    });
};

export const handleDeleteResource = async (request: Request): Promise<Response> => {
    const resourceId = request.url.split('/').pop();
    await deleteResource(resourceId);
    return new Response(null, { status: 204 });
};