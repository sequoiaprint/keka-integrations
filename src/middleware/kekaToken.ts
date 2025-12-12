import axios from "axios";
import redis from "../dbConfig/redis";
import { Request, Response, NextFunction } from "express";

let accessToken: string | null = null;


export const fetchKekaToken = async (): Promise<string> => {
  try {
    const params = new URLSearchParams();
    params.append("grant_type", "kekaapi");
    params.append("scope", "kekaapi");
    params.append("client_id", process.env.KEKA_CLIENT_ID!);
    params.append("client_secret", process.env.KEKA_CLIENT_SECRET!);
    params.append("api_key", process.env.KEKA_API_KEY!);

    const response = await axios.post(
      "https://login.keka.com/connect/token",
      params.toString(),
      {
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
      }
    );

    const token = response.data.access_token;
    
    if (!token) {
      throw new Error("No access token received from Keka API");
    }

    accessToken = token;
    

    await redis.setex("keka_access_token", 86400, token);
    
    console.log(" Keka Access Token fetched and stored:", new Date().toISOString());
    return token;
  } catch (error: any) {
    console.error("Keka Token Error:", error.response?.data || error.message);
    throw error;
  }
};


declare global {
  namespace Express {
    interface Request {
      kekaToken?: string;
    }
  }
}


export const kekaTokenMiddleware = async (req: Request, res: Response, next: NextFunction) => {
  try {
  
    if (accessToken) {
      req.kekaToken = accessToken;
      return next();
    }

  
    const redisToken = await redis.get("keka_access_token");
    if (redisToken && typeof redisToken === 'string') {
      accessToken = redisToken;
      req.kekaToken = accessToken;
      return next();
    }

  
    const newToken = await fetchKekaToken();
    req.kekaToken = newToken;
    next();
  } catch (error) {
    console.error(" Keka Token Middleware Error:", error);
    res.status(500).json({ 
      error: "Failed to get Keka access token",
      message: "Please ensure Keka credentials are configured correctly"
    });
  }
};


export const getKekaToken = (): string | null => {
  return accessToken;
};