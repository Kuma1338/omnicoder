/// API key encryption/decryption using Windows DPAPI
/// Falls back to base64 encoding on non-Windows (for dev purposes)

#[cfg(target_os = "windows")]
use windows_sys::Win32::Security::Cryptography::{
    CryptProtectData, CryptUnprotectData,
};

#[cfg(target_os = "windows")]
use windows_sys::Win32::Foundation::LocalFree;

#[tauri::command]
pub fn encrypt_secret(plaintext: String) -> Result<String, String> {
    #[cfg(target_os = "windows")]
    {
        encrypt_windows(&plaintext)
    }
    #[cfg(not(target_os = "windows"))]
    {
        use base64::{Engine as _, engine::general_purpose};
        Ok(general_purpose::STANDARD.encode(plaintext.as_bytes()))
    }
}

#[tauri::command]
pub fn decrypt_secret(ciphertext: String) -> Result<String, String> {
    #[cfg(target_os = "windows")]
    {
        decrypt_windows(&ciphertext)
    }
    #[cfg(not(target_os = "windows"))]
    {
        use base64::{Engine as _, engine::general_purpose};
        let bytes = general_purpose::STANDARD
            .decode(ciphertext.as_bytes())
            .map_err(|e| e.to_string())?;
        String::from_utf8(bytes).map_err(|e| e.to_string())
    }
}

#[cfg(target_os = "windows")]
fn encrypt_windows(plaintext: &str) -> Result<String, String> {
    use base64::{Engine as _, engine::general_purpose};

    let bytes = plaintext.as_bytes().to_vec();
    let mut input = windows_sys::Win32::Security::Cryptography::CRYPT_INTEGER_BLOB {
        cbData: bytes.len() as u32,
        pbData: bytes.as_ptr() as *mut u8,
    };
    let mut output = windows_sys::Win32::Security::Cryptography::CRYPT_INTEGER_BLOB {
        cbData: 0,
        pbData: std::ptr::null_mut(),
    };

    let success = unsafe {
        CryptProtectData(
            &mut input,
            std::ptr::null(),
            std::ptr::null_mut(),
            std::ptr::null_mut(),
            std::ptr::null(),
            0,
            &mut output,
        )
    };

    if success == 0 {
        return Err(format!("CryptProtectData failed with error: {}", unsafe {
            windows_sys::Win32::Foundation::GetLastError()
        }));
    }

    let encrypted_bytes = unsafe {
        std::slice::from_raw_parts(output.pbData, output.cbData as usize).to_vec()
    };

    unsafe { LocalFree(output.pbData as *mut _); }

    Ok(general_purpose::STANDARD.encode(&encrypted_bytes))
}

#[cfg(target_os = "windows")]
fn decrypt_windows(ciphertext: &str) -> Result<String, String> {
    use base64::{Engine as _, engine::general_purpose};

    let encrypted_bytes = general_purpose::STANDARD
        .decode(ciphertext.as_bytes())
        .map_err(|e| e.to_string())?;

    let mut input = windows_sys::Win32::Security::Cryptography::CRYPT_INTEGER_BLOB {
        cbData: encrypted_bytes.len() as u32,
        pbData: encrypted_bytes.as_ptr() as *mut u8,
    };
    let mut output = windows_sys::Win32::Security::Cryptography::CRYPT_INTEGER_BLOB {
        cbData: 0,
        pbData: std::ptr::null_mut(),
    };

    let success = unsafe {
        CryptUnprotectData(
            &mut input,
            std::ptr::null_mut(),
            std::ptr::null_mut(),
            std::ptr::null_mut(),
            std::ptr::null(),
            0,
            &mut output,
        )
    };

    if success == 0 {
        return Err(format!("CryptUnprotectData failed with error: {}", unsafe {
            windows_sys::Win32::Foundation::GetLastError()
        }));
    }

    let decrypted_bytes = unsafe {
        std::slice::from_raw_parts(output.pbData, output.cbData as usize).to_vec()
    };

    unsafe { LocalFree(output.pbData as *mut _); }

    String::from_utf8(decrypted_bytes).map_err(|e| e.to_string())
}
