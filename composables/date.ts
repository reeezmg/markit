export function formatDate(dateString: string): string {
    try{
        const date = new Date(dateString);
    
        if (isNaN(date.getTime())) {
            throw new Error("Invalid date format");
        }
    
        const day = date.getDate();
        const month = date.getMonth() + 1;
        const year = date.getFullYear();
    
        const dayStr = day < 10 ? `0${day}` : `${day}`;
        const monthStr = month < 10 ? `0${month}` : `${month}`;
    
        return `${dayStr}/${monthStr}/${year}`;
    }
    catch(err){
        return ''
        console.error(err)
    }
    
}

export function formatTime(dateString: string): string {
    const date = new Date(dateString);

    if (isNaN(date.getTime())) {
        throw new Error("Invalid date format");
    }

    const hours = date.getHours();
    const minutes = date.getMinutes();

    const hoursStr = hours < 10 ? `0${hours}` : `${hours}`;
    const minutesStr = minutes < 10 ? `0${minutes}` : `${minutes}`;

    return `${hoursStr}:${minutesStr}`;
}